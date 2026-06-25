/**
 * Lume outbound — send messages from OpenClaw core to the Lingxi Cloud frontend
 */

import type { ChannelOutboundContext } from "openclaw/plugin-sdk/channel-runtime";
import { finishChatRun, getChatRun } from "./chat-run.js";

interface LumeDeliveryResult {
  channel: "lume";
  messageId: string;
}

function resolveSessionKey(ctx: ChannelOutboundContext): string {
  const raw = ctx as Record<string, unknown>;
  const fromCtx = raw.sessionKey ?? raw.SessionKey;
  if (typeof fromCtx === "string" && fromCtx) return fromCtx;
  const run = getChatRun(ctx.to);
  const sk = run?.sessionKey ?? "";
  return sk;
}

export async function sendLumeText(ctx: ChannelOutboundContext): Promise<LumeDeliveryResult> {
  const userId = ctx.to;
  const sessionKey = resolveSessionKey(ctx);
  const messageId = getChatRun(userId, sessionKey || undefined)?.runId
    ?? `lume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (sessionKey) {
    finishChatRun(userId, sessionKey, ctx.text ?? "", { messageId });
  } else {
    const { getBridgeForAccount } = await import("./ws-bridge-store.js");
    const bridge = getBridgeForAccount(ctx.accountId ?? "default");
    if (!bridge) throw new Error(`lume: no WebSocket bridge for account ${ctx.accountId ?? "default"}`);
    const sent = bridge.sendToUser(userId, {
      type: "event",
      event: "chat",
      payload: {
        message: ctx.text,
        state: "final",
        messageId,
        runId: messageId,
        timestamp: Date.now(),
      },
    });
    if (!sent) throw new Error(`lume: user ${userId} is not connected`);
  }

  return { channel: "lume", messageId };
}

export async function sendLumeMedia(ctx: ChannelOutboundContext): Promise<LumeDeliveryResult> {
  const userId = ctx.to;
  const sessionKey = resolveSessionKey(ctx);
  const messageId = getChatRun(userId, sessionKey || undefined)?.runId
    ?? `lume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (sessionKey) {
    finishChatRun(userId, sessionKey, ctx.text ?? "", {
      messageId,
      mediaUrl: ctx.mediaUrl,
    });
  } else {
    const { getBridgeForAccount } = await import("./ws-bridge-store.js");
    const bridge = getBridgeForAccount(ctx.accountId ?? "default");
    if (!bridge) throw new Error(`lume: no WebSocket bridge for account ${ctx.accountId ?? "default"}`);
    const sent = bridge.sendToUser(userId, {
      type: "event",
      event: "chat",
      payload: {
        message: ctx.text ?? "",
        mediaUrl: ctx.mediaUrl,
        state: "final",
        messageId,
        runId: messageId,
        timestamp: Date.now(),
      },
    });
    if (!sent) throw new Error(`lume: user ${userId} is not connected`);
  }

  return { channel: "lume", messageId };
}
