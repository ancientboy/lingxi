/**
 * Simple in-process store for active WebSocket bridges, keyed by accountId.
 * The gateway.startAccount creates a bridge and stores it here;
 * outbound.sendText/sendMedia retrieves it.
 */
const bridges = new Map();
export function registerBridge(accountId, bridge) {
    bridges.set(accountId, bridge);
}
export function unregisterBridge(accountId) {
    bridges.delete(accountId);
}
export function getBridgeForAccount(accountId) {
    if (!accountId)
        accountId = "default";
    return bridges.get(accountId) ?? null;
}
