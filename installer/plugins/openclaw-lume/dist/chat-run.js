/**
 * Gateway-aligned chat event emitter for Lume WebSocket clients.
 */
const activeRuns = new Map();
function runKey(userId, sessionKey) {
    return `${userId}:${sessionKey}`;
}
async function getBridge(accountId) {
    const { getBridgeForAccount } = await import("./ws-bridge-store.js");
    return getBridgeForAccount(accountId);
}
function emitChat(accountId, userId, payload) {
    void getBridge(accountId).then((bridge) => {
        if (!bridge)
            return;
        bridge.sendToUser(userId, {
            type: "event",
            event: "chat",
            payload: {
                timestamp: Date.now(),
                ...payload,
            },
        });
    });
}
export function startChatRun(params) {
    const runId = `lume-${params.userId.substring(0, 8)}-${Date.now()}`;
    const ctx = {
        runId,
        sessionKey: params.sessionKey,
        userId: params.userId,
        accountId: params.accountId,
        text: "",
    };
    activeRuns.set(runKey(params.userId, params.sessionKey), ctx);
    emitChat(params.accountId, params.userId, {
        state: "start",
        runId,
        sessionKey: params.sessionKey,
    });
    return ctx;
}
export function getChatRun(userId, sessionKey) {
    if (sessionKey) {
        return activeRuns.get(runKey(userId, sessionKey));
    }
    for (const [key, ctx] of activeRuns) {
        if (key.startsWith(`${userId}:`))
            return ctx;
    }
    return undefined;
}
export function pushChatDelta(userId, sessionKey, text, extra) {
    const ctx = activeRuns.get(runKey(userId, sessionKey));
    if (!ctx)
        return;
    ctx.text = text;
    emitChat(ctx.accountId, userId, {
        state: "delta",
        runId: ctx.runId,
        sessionKey: ctx.sessionKey,
        message: text,
        ...extra,
    });
}
export function pushChatBlock(userId, sessionKey, text, extra) {
    const ctx = activeRuns.get(runKey(userId, sessionKey));
    if (!ctx)
        return;
    ctx.text = text;
    emitChat(ctx.accountId, userId, {
        state: "block",
        runId: ctx.runId,
        sessionKey: ctx.sessionKey,
        message: text,
        ...extra,
    });
}
export function finishChatRun(userId, sessionKey, text, extra) {
    const ctx = activeRuns.get(runKey(userId, sessionKey));
    const runId = ctx?.runId ?? `lume-${userId.substring(0, 8)}-${Date.now()}`;
    const sk = ctx?.sessionKey ?? sessionKey;
    const accountId = ctx?.accountId ?? "default";
    emitChat(accountId, userId, {
        state: "final",
        runId,
        sessionKey: sk,
        message: text,
        messageId: runId,
        ...extra,
    });
    activeRuns.delete(runKey(userId, sessionKey));
    // 推送 sessions.updated 事件，客户端据此增量更新会话列表
    void getBridge(accountId).then((bridge) => {
        if (!bridge)
            return;
        bridge.sendToUser(userId, {
            type: "event",
            event: "sessions.updated",
            payload: {
                sessionKey: sk,
                timestamp: Date.now(),
                lastMessagePreview: text.length > 80 ? text.substring(0, 80) + "..." : text,
            },
        });
    });
}
export function failChatRun(userId, sessionKey, text, accountId = "default") {
    const ctx = activeRuns.get(runKey(userId, sessionKey));
    const runId = ctx?.runId ?? `lume-err-${Date.now()}`;
    const aid = ctx?.accountId ?? accountId;
    emitChat(aid, userId, {
        state: "error",
        runId,
        sessionKey: ctx?.sessionKey ?? sessionKey,
        message: text,
    });
    activeRuns.delete(runKey(userId, sessionKey));
    // 同样推送 sessions.updated（带错误信息预览）
    void getBridge(aid).then((bridge) => {
        if (!bridge)
            return;
        bridge.sendToUser(userId, {
            type: "event",
            event: "sessions.updated",
            payload: {
                sessionKey: ctx?.sessionKey ?? sessionKey,
                timestamp: Date.now(),
                lastMessagePreview: "⚠️ " + (text.length > 80 ? text.substring(0, 80) + "..." : text),
            },
        });
    });
}
export function clearChatRun(userId, sessionKey) {
    activeRuns.delete(runKey(userId, sessionKey));
}
