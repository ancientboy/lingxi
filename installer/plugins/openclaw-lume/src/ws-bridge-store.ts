/**
 * Simple in-process store for active WebSocket bridges, keyed by accountId.
 * The gateway.startAccount creates a bridge and stores it here;
 * outbound.sendText/sendMedia retrieves it.
 */

import type { WsBridge } from "./ws-bridge.js";

const bridges = new Map<string, WsBridge>();

export function registerBridge(accountId: string, bridge: WsBridge): void {
  bridges.set(accountId, bridge);
}

export function unregisterBridge(accountId: string): void {
  bridges.delete(accountId);
}

export function getBridgeForAccount(accountId: string | null | undefined): WsBridge | null {
  if (!accountId) accountId = "default";
  return bridges.get(accountId) ?? null;
}
