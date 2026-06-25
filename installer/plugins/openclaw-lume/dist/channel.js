/**
 * Lume channel plugin definition
 *
 * Connects Lingxi Cloud (灵犀云) to OpenClaw via a WebSocket bridge.
 * The frontend connects to a WS server managed by this plugin,
 * sends messages through chat.send, and receives AI responses
 * as events pushed through the same WebSocket.
 */
import { listLumeAccountIds, resolveLumeAccount } from "./accounts.js";
import { sendLumeText, sendLumeMedia } from "./outbound.js";
export const lumePlugin = {
    id: "lume",
    meta: {
        id: "lume",
        label: "Lume",
        selectionLabel: "Lume (灵犀云)",
        docsPath: "/channels/lume",
        docsLabel: "Lume",
        blurb: "WebSocket bridge for Lingxi Cloud frontend",
        order: 50,
    },
    capabilities: {
        chatTypes: ["direct"],
        media: true,
        blockStreaming: true,
    },
    streaming: {
        blockStreamingCoalesceDefaults: {
            minChars: 20,
            idleMs: 800,
        },
    },
    reload: {
        configPrefixes: ["channels.lume"],
    },
    config: {
        listAccountIds: (cfg) => listLumeAccountIds(cfg),
        resolveAccount: (cfg, accountId) => resolveLumeAccount(cfg, accountId),
        isConfigured: (account) => account.configured,
        describeAccount: (account) => ({
            accountId: account.accountId,
            enabled: account.enabled,
            configured: account.configured,
        }),
    },
    outbound: {
        deliveryMode: "direct",
        textChunkLimit: 4000,
        sendText: async (ctx) => {
            return sendLumeText(ctx);
        },
        sendMedia: async (ctx) => {
            return sendLumeMedia(ctx);
        },
    },
    status: {
        defaultRuntime: {
            accountId: "",
            lastError: null,
            lastInboundAt: null,
            lastOutboundAt: null,
        },
        collectStatusIssues: (_accounts) => [],
        buildChannelSummary: ({ snapshot }) => ({
            configured: snapshot.configured ?? false,
            lastError: snapshot.lastError ?? null,
        }),
        buildAccountSnapshot: ({ account, runtime }) => ({
            ...runtime,
            accountId: account.accountId,
            enabled: account.enabled,
            configured: account.configured,
        }),
    },
    gateway: {
        startAccount: async (ctx) => {
            if (!ctx) {
                throw new Error("lume: gateway.startAccount called with undefined ctx");
            }
            const account = ctx.account;
            if (!account.configured) {
                ctx.log?.error?.(`[${account.accountId}] lume not configured — set channels.lume.secret`);
                throw new Error("lume not configured: missing secret");
            }
            if (!ctx.channelRuntime) {
                const msg = "lume: channelRuntime not available — host version too old";
                ctx.log?.error?.(`[${account.accountId}] ${msg}`);
                throw new Error(msg);
            }
            ctx.log?.info?.(`[${account.accountId}] starting lume WebSocket bridge on port ${account.port}`);
            ctx.setStatus?.({
                accountId: account.accountId,
                running: true,
                lastStartAt: Date.now(),
                lastEventAt: Date.now(),
            });
            // Import dynamically to keep the main channel.ts light during plugin registration
            const { createWsBridge } = await import("./ws-bridge.js");
            const { createInboundHandler } = await import("./inbound.js");
            const { registerBridge, unregisterBridge } = await import("./ws-bridge-store.js");
            const { ensureLocalDeviceScopes } = await import("./ensure-device-scopes.js");
            ensureLocalDeviceScopes(ctx.log);
            const gw = ctx.cfg?.gateway;
            const gwPort = typeof gw?.port === "number" ? gw.port : 18789;
            const gwToken = typeof gw?.auth?.token === "string" ? gw.auth.token : "";
            const gatewayApi = gwToken
                ? { url: `ws://127.0.0.1:${gwPort}`, token: gwToken, timeoutMs: 20_000 }
                : undefined;
            if (!gatewayApi) {
                ctx.log?.warn?.(`[${account.accountId}] lume: gateway token missing — sessions.list/chat.history unavailable`);
            }
            const bridge = createWsBridge(account, gatewayApi);
            // Wire inbound handler
            const inboundHandler = createInboundHandler(ctx, gatewayApi);
            bridge.onInbound(inboundHandler);
            // Start the WebSocket server
            await bridge.start();
            registerBridge(account.accountId, bridge);
            ctx.log?.info?.(`[${account.accountId}] lume WebSocket bridge listening on port ${account.port}`);
            // Return a promise that resolves when the abort signal fires
            // (keeps the gateway task alive)
            return new Promise((resolve) => {
                if (ctx.abortSignal?.aborted) {
                    void bridge.stop().then(() => {
                        unregisterBridge(account.accountId);
                        resolve();
                    });
                    return;
                }
                ctx.abortSignal?.addEventListener("abort", () => {
                    bridge.stop().then(() => {
                        unregisterBridge(account.accountId);
                        resolve();
                    });
                }, { once: true });
            });
        },
        stopAccount: async (ctx) => {
            const account = ctx.account;
            const { unregisterBridge, getBridgeForAccount } = await import("./ws-bridge-store.js");
            const bridge = getBridgeForAccount(account.accountId);
            if (bridge) {
                await bridge.stop();
                unregisterBridge(account.accountId);
            }
            ctx.log?.info?.(`[${account.accountId}] lume bridge stopped`);
        },
    },
};
