# openclaw-lume

Lume channel plugin for OpenClaw — connects Lingxi Cloud (灵犀云) to OpenClaw via WebSocket bridge.

## Overview

This plugin replaces the direct WebSocket proxy (`ws-proxy.js`) with a standard OpenClaw channel plugin. All messages pass through OpenClaw's core engine, which provides:

- **Heartbeat filtering** — heartbeat messages are not forwarded to the frontend
- **NO_REPLY handling** — silent/empty replies are suppressed
- **Tool call trace cleaning** — intermediate tool call output is cleaned before delivery
- **Block streaming coalescing** — streaming messages are buffered and sent at natural break points

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐     dispatchReplyFromConfig     ┌───────────┐
│  Lingxi Cloud   │ ◄────────────────► │   Lume Plugin    │ ───────────────────────────────► │  OpenClaw │
│    Frontend     │    chat.send /     │   (this repo)    │ ◄── outbound: sendText/sendMedia │   Core    │
│                 │    auth / ping     │                  │                                  │  Engine   │
└─────────────────┘                    └──────────────────┘                                  └───────────┘
```

1. **Frontend** connects via WebSocket to the Lume bridge (port 18790 by default)
2. **Auth**: Frontend sends `{ method: "auth", params: { token, userId } }` 
3. **Inbound**: Frontend sends `{ method: "chat.send", params: { message, agentId?, sessionKey? } }`
4. **Core Processing**: The plugin dispatches to OpenClaw core via `channelRuntime.reply.dispatchReplyFromConfig`
5. **Outbound**: Core calls `sendText`/`sendMedia` → plugin pushes clean response to the frontend

## Configuration

Add to your OpenClaw config under `channels.lume`:

```yaml
channels:
  lume:
    secret: "your-shared-secret"
    port: 18790
    # allowedOrigins: ["https://your-frontend.com"]
```

## WebSocket Protocol

### Auth
```json
{ "method": "auth", "id": "1", "params": { "token": "your-shared-secret", "userId": "user123" } }
→ { "type": "res", "id": "1", "ok": true, "payload": { "userId": "user123", "serverTime": 1718234567890 } }
```

### Send Message
```json
{ "method": "chat.send", "id": "2", "params": { "message": "Hello!", "agentId": "lingxi" } }
→ { "type": "res", "id": "2", "ok": true, "payload": { "received": true } }
```

### Receive Response (pushed as event)
```json
{ "type": "event", "event": "chat", "payload": { "message": "Hi there!", "state": "final", "messageId": "lume-...", "timestamp": 1718234567900 } }
```

### Ping
```json
{ "method": "ping", "id": "3" }
→ { "type": "res", "id": "3", "ok": true, "payload": { "pong": true } }
```

## Development

```bash
npm install
npm run build
npm run typecheck
```

## Installation

Copy or symlink this directory to your OpenClaw plugins folder, then restart the gateway.
