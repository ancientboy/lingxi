/**
 * Internal Gateway RPC — Lume plugin proxies session/history from local OpenClaw Gateway.
 */
import { resolveOpenClawModel } from "./model-resolver.js";
import { callGatewayRpc } from "./gateway-rpc.js";
/** Match lingxi-cloud connect-info: agent:main:user_{first8} */
export function resolveUserSessionPrefix(userId) {
    return `agent:main:user_${userId.substring(0, 8)}`;
}
/** 仅排除系统/内部噪音会话，不按 userId 过滤（同机 UI + 灵犀云混用） */
const SYSTEM_SESSION_PATTERNS = [
    /:cron:/i,
    /:subagent:/i,
    /^agent:main:main$/i,
    /^agent:ops:main$/i,
    /^agent:main:(boot|allow-check|verify-|cli-test)/i,
    /^agent:main:dashboard:/i,
];
export function isSystemSessionKey(sessionKey) {
    return SYSTEM_SESSION_PATTERNS.some((re) => re.test(sessionKey));
}
function readNested(obj, path) {
    let cur = obj;
    for (const key of path) {
        if (!cur || typeof cur !== "object")
            return undefined;
        cur = cur[key];
    }
    return cur;
}
/**
 * 可在灵犀云列表/读写/删除的会话：
 * - 仅排除 cron/subagent/内部测试等系统噪音
 * - 包含 UI 主会话、openresponses、各 agent 会话、所有 user_* 前缀
 * - 不按 userId 严格过滤（同机 UI / 灵犀云随时切换）
 */
export function isListableChatSession(sessionKey, userId, _session) {
    if (!sessionKey || !userId)
        return false;
    return !isSystemSessionKey(sessionKey);
}
/** @deprecated 使用 isListableChatSession；保留兼容 */
export function sessionBelongsToUser(sessionKey, userId, session) {
    return isListableChatSession(sessionKey, userId, session);
}
async function callGateway(cfg, method, params) {
    return callGatewayRpc(cfg, method, params ?? {});
}
export async function listUserSessions(cfg, userId, params = {}) {
    const result = await callGateway(cfg, "sessions.list", params);
    const sessions = Array.isArray(result.sessions) ? result.sessions : [];
    const prefix = resolveUserSessionPrefix(userId);
    const filtered = sessions.filter((s) => {
        if (!s || typeof s !== "object")
            return false;
        const row = s;
        const key = String(row.key ?? "");
        return isListableChatSession(key, userId, row);
    });
    return {
        ...result,
        sessions: filtered,
        count: filtered.length,
        totalCount: filtered.length,
        userPrefix: prefix,
    };
}
const HIDDEN_ROLES = new Set(["tool", "toolresult", "system"]);
const NOISE_TEXT = new Set(["HEARTBEAT_OK", "NO_REPLY"]);
const FAILED_PLACEHOLDER = "[assistant turn failed before producing content]";
function extractTextContent(content) {
    if (content == null)
        return "";
    if (typeof content === "string")
        return content;
    if (Array.isArray(content)) {
        return content
            .filter((b) => typeof b === "object" && b && b.type === "text")
            .map((b) => String(b.text ?? ""))
            .join("");
    }
    return String(content);
}
function extractMessageId(msg, index) {
    const oc = msg.__openclaw;
    if (oc?.id)
        return String(oc.id);
    if (msg.id)
        return String(msg.id);
    const role = String(msg.role ?? "unknown");
    const ts = msg.timestamp ?? msg.createdAt ?? index;
    return `${role}-${ts}-${index}`;
}
function shouldSkipMessage(msg, text) {
    const role = String(msg.role ?? "").toLowerCase();
    if (HIDDEN_ROLES.has(role))
        return true;
    const trimmed = text.trim();
    if (!trimmed && role === "assistant" && !msg.errorMessage)
        return true;
    if (NOISE_TEXT.has(trimmed))
        return true;
    if (trimmed.startsWith("Read HEARTBEAT.md") && trimmed.length < 100)
        return true;
    if (trimmed.includes("<<<EXTERNAL_UNTRUSTED_CONTENT"))
        return true;
    if (trimmed.includes("SECURITY NOTICE:"))
        return true;
    return false;
}
function normalizeHistoryMessage(msg, index) {
    const role = String(msg.role ?? "assistant");
    let text = extractTextContent(msg.content);
    if (shouldSkipMessage(msg, text))
        return null;
    if (role === "assistant") {
        const err = typeof msg.errorMessage === "string" ? msg.errorMessage.trim() : "";
        if (err && (!text || text === FAILED_PLACEHOLDER)) {
            text = `⚠️ 模型调用失败：${err}`;
        }
        else if (text === FAILED_PLACEHOLDER) {
            return null;
        }
    }
    if (!text.trim() && role !== "user")
        return null;
    const id = extractMessageId(msg, index);
    const createdAt = msg.timestamp ?? msg.createdAt ?? Date.now();
    const normalized = {
        id,
        role,
        content: text,
        createdAt,
        timestamp: createdAt,
    };
    if (msg.model)
        normalized.model = msg.model;
    if (msg.provider)
        normalized.modelProvider = msg.provider;
    if (msg.usage)
        normalized.usage = msg.usage;
    if (msg.attachments)
        normalized.attachments = msg.attachments;
    return normalized;
}
export function sanitizeHistoryMessages(raw) {
    const messages = [];
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (!item || typeof item !== "object")
            continue;
        const normalized = normalizeHistoryMessage(item, i);
        if (normalized)
            messages.push(normalized);
    }
    return { messages, totalRaw: raw.length, visibleCount: messages.length };
}
async function assertSessionAccess(cfg, userId, sessionKey) {
    if (isListableChatSession(sessionKey, userId))
        return;
    const result = await callGateway(cfg, "sessions.list", {});
    const sessions = Array.isArray(result.sessions) ? result.sessions : [];
    const row = sessions.find((s) => s && typeof s === "object" && String(s.key) === sessionKey);
    if (row && isListableChatSession(sessionKey, userId, row))
        return;
    throw new Error(`Session access denied: ${sessionKey}`);
}
export async function patchSessionModel(cfg, userId, sessionKey, modelId) {
    await assertSessionAccess(cfg, userId, sessionKey);
    const model = resolveOpenClawModel(modelId);
    await callGateway(cfg, "sessions.patch", {
        key: sessionKey,
        model,
    });
}
export async function getUserChatHistory(cfg, userId, params) {
    const sessionKey = String(params.sessionKey ?? "");
    await assertSessionAccess(cfg, userId, sessionKey);
    const limit = typeof params.limit === "number" ? params.limit : 100;
    const raw = await callGateway(cfg, "chat.history", { sessionKey, limit });
    const rawMessages = Array.isArray(raw.messages) ? raw.messages : [];
    const { messages, totalRaw, visibleCount } = sanitizeHistoryMessages(rawMessages);
    return {
        ...raw,
        messages,
        totalRaw,
        visibleCount,
        limit,
    };
}
export async function abortChat(cfg, userId, sessionKey) {
    await assertSessionAccess(cfg, userId, sessionKey);
    return callGateway(cfg, "chat.abort", { sessionKey });
}
export async function patchSession(cfg, userId, params) {
    const key = String(params.key ?? params.sessionKey ?? "");
    if (!key)
        throw new Error("sessions.patch requires key");
    await assertSessionAccess(cfg, userId, key);
    const patch = { key };
    if (params.model !== undefined) {
        patch.model = resolveOpenClawModel(params.model);
    }
    if (params.label !== undefined)
        patch.label = params.label;
    if (params.title !== undefined && params.label === undefined)
        patch.label = params.title;
    if (params.displayName !== undefined)
        patch.displayName = params.displayName;
    if (params.thinkingLevel !== undefined)
        patch.thinkingLevel = params.thinkingLevel;
    return callGateway(cfg, "sessions.patch", patch);
}
export async function deleteSession(cfg, userId, sessionKey) {
    const key = sessionKey?.trim();
    if (!key)
        throw new Error("sessions.delete requires key");
    if (isSystemSessionKey(key)) {
        throw new Error(`Cannot delete system session: ${key}`);
    }
    // 删除不做 sessions.list 校验：新会话可能尚未出现在列表中
    return callGateway(cfg, "sessions.delete", { key, sessionKey: key });
}
/** gateway.call 白名单：管理类 Gateway RPC */
const ALLOWED_GATEWAY_EXACT = new Set([
    "config.get",
    "config.patch",
    "agents.delete",
    "health",
    "status",
    "tools.invoke",
    "cron.list",
    "cron.add",
    "cron.update",
    "cron.remove",
    "cron.run",
    "cron.runs",
    "cron.status",
]);
export function isAllowedGatewayMethod(method) {
    const m = method.trim();
    if (!m)
        return false;
    if (ALLOWED_GATEWAY_EXACT.has(m))
        return true;
    return m.startsWith("cron.");
}
export async function callGatewayMethod(cfg, method, params = {}) {
    const m = method.trim();
    if (!isAllowedGatewayMethod(m)) {
        throw new Error(`Gateway method not allowed: ${m}`);
    }
    return callGateway(cfg, m, params);
}
