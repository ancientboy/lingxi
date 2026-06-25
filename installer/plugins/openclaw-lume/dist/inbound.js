/**
 * Lume inbound — receive messages from the Lingxi Cloud frontend and dispatch to OpenClaw core
 */
import { patchSessionModel, resolveUserSessionPrefix } from "./gateway-api.js";
import { startChatRun, pushChatDelta, failChatRun } from "./chat-run.js";
function isValidSessionKey(key) {
    return !!key && key.startsWith("agent:main:");
}
async function pushChatError(userId, accountId, text, sessionKey) {
    if (sessionKey) {
        failChatRun(userId, sessionKey, text, accountId);
        return;
    }
    const { getBridgeForAccount } = await import("./ws-bridge-store.js");
    const bridge = getBridgeForAccount(accountId);
    if (!bridge)
        return;
    bridge.sendToUser(userId, {
        type: "event",
        event: "chat",
        payload: {
            message: text,
            state: "error",
            runId: `lume-err-${Date.now()}`,
            timestamp: Date.now(),
        },
    });
}
export function createInboundHandler(ctx, gatewayApi) {
    const { cfg } = ctx;
    const rt = ctx.channelRuntime;
    if (!rt) {
        throw new Error("lume: channelRuntime not available — host version too old");
    }
    return async ({ userId, accountId, message, sessionKey, agentId, model, attachments }) => {
        const effectiveAgentId = agentId ?? "main";
        try {
            const route = rt.routing.resolveAgentRoute({
                cfg,
                channel: "lume",
                accountId,
                peer: { kind: "direct", id: userId },
            });
            const userSessionPrefix = resolveUserSessionPrefix(userId);
            const userScopedKey = `${userSessionPrefix}:agent:${effectiveAgentId}`;
            // 放宽校验：接受任意合法 sessionKey（含 agent:main:main 等裸 session）
            // 仅当 sessionKey 为空或非法时才回退到 user-scoped key
            const effectiveSessionKey = isValidSessionKey(sessionKey) && sessionKey.trim().length > 0
                ? sessionKey
                : userScopedKey;
            startChatRun({
                userId,
                accountId,
                sessionKey: effectiveSessionKey,
            });
            // Register active user for ai-proxy (lume/auto reads preferredModel by userId)
            try {
                await fetch("http://127.0.0.1:13000/internal/active-user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId }),
                });
            }
            catch (err) {
                ctx.log?.warn?.(`lume: active-user notify failed: ${String(err)}`);
            }
            // Ensure session routes through lume/auto (model preference handled by ai-proxy)
            if (gatewayApi?.token && isValidSessionKey(effectiveSessionKey)) {
                try {
                    await patchSessionModel(gatewayApi, userId, effectiveSessionKey, "lume/auto");
                }
                catch (err) {
                    ctx.log?.warn?.(`lume: sessions.patch lume/auto failed: ${String(err)}`);
                }
            }
            const rawCtx = {
                From: userId,
                To: "bot",
                Body: message,
                CommandBody: message,
                BodyForAgent: message,
                BodyForCommands: message,
                channel: "lume",
                accountId,
                agentId: route.agentId,
                SessionKey: effectiveSessionKey,
                CommandAuthorized: true,
                timestamp: Date.now(),
            };
            if (attachments?.length) {
                rawCtx.Attachments = attachments;
            }
            const finalized = rt.reply.finalizeInboundContext(rawCtx);
            const sessionStore = cfg.session;
            const storePath = rt.session.resolveStorePath(sessionStore?.store, { agentId: route.agentId });
            await rt.session.recordInboundSession({
                storePath,
                sessionKey: effectiveSessionKey,
                ctx: finalized,
                updateLastRoute: {
                    sessionKey: route.mainSessionKey,
                    channel: "lume",
                    to: userId,
                    accountId,
                },
                onRecordError: (err) => {
                    ctx.log?.error?.(`lume: recordInboundSession: ${String(err)}`);
                },
            });
            const humanDelay = rt.reply.resolveHumanDelayConfig(cfg, route.agentId);
            const { dispatcher, replyOptions, markDispatchIdle } = rt.reply.createReplyDispatcherWithTyping({
                humanDelay,
                deliver: async (payload) => {
                    const text = typeof payload.text === "string" ? payload.text : "";
                    const mediaUrl = typeof payload.mediaUrl === "string" ? payload.mediaUrl : undefined;
                    if (!text && !mediaUrl)
                        return;
                    pushChatDelta(userId, effectiveSessionKey, text, mediaUrl ? { mediaUrl, state: "delta" } : undefined);
                },
                onError: (err, info) => {
                    ctx.log?.error?.(`lume: reply ${info.kind}: ${String(err)}`);
                    void pushChatError(userId, accountId, `⚠️ 回复失败：${String(err)}`, effectiveSessionKey);
                },
            });
            try {
                await rt.reply.withReplyDispatcher({
                    dispatcher,
                    run: () => rt.reply.dispatchReplyFromConfig({
                        ctx: finalized,
                        cfg,
                        dispatcher,
                        replyOptions: {
                            ...replyOptions,
                        },
                    }),
                });
            }
            finally {
                markDispatchIdle();
            }
        }
        catch (err) {
            ctx.log?.error?.(`lume: inbound dispatch failed for user=${userId}: ${String(err)}`);
            await pushChatError(userId, accountId, `⚠️ 消息处理失败：${String(err)}`, sessionKey);
        }
    };
}
