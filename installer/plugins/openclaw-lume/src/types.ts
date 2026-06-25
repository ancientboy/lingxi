/**
 * Lume channel plugin — shared types
 */

/** Runtime config resolved from channels.lume */
export interface LumeAccount {
  accountId: string;
  port: number;
  secret: string;
  allowedOrigins: string[];
  enabled: boolean;
  configured: boolean;
}

/** Key for per-user WebSocket connections: accountId:userId */
export type ConnectionKey = string;

/** Message arriving from Lingxi Cloud frontend */
export interface LumeInboundMessage {
  /** Unique request id for correlating responses */
  id: string;
  /** The RPC method name */
  method: string;
  /** Method parameters */
  params?: Record<string, unknown>;
}

/** Lume-specific chat.send params */
export interface LumeChatSendParams {
  message: string;
  sessionKey?: string;
  agentId?: string;
  userId?: string;
  /** User-selected model id from Lingxi Cloud (e.g. auto, cu/gpt-5.2, glm-5.2) */
  model?: string;
  attachments?: Array<{
    url: string;
    mimeType?: string;
    filename?: string;
  }>;
}

/** Outbound event pushed to Lingxi Cloud frontend */
export interface LumeOutboundEvent {
  type: "event";
  event: string;
  payload: Record<string, unknown>;
}

/** Response to an RPC call */
export interface LumeRpcResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
}

/** Error event */
export interface LumeErrorEvent {
  type: "error";
  error: string;
}

export type LumeWsMessage = LumeOutboundEvent | LumeRpcResponse | LumeErrorEvent;
