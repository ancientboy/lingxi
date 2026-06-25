/**
 * Local OpenClaw Gateway RPC — protocol v4 challenge + device auth.
 * Replaces removed callGatewayFromCli in newer OpenClaw SDK builds.
 */

import WebSocket from "ws";
import crypto from "node:crypto";
import fs from "node:fs";
import type { GatewayApiConfig } from "./gateway-api.js";
import { LUME_OPERATOR_SCOPES } from "./ensure-device-scopes.js";

interface DeviceIdentity {
  deviceId: string;
  privateKeyPem: string;
  publicKeyPem: string;
}

let cachedDevice: DeviceIdentity | null | undefined;
let reqCounter = 1;

function loadDeviceIdentity(): DeviceIdentity | null {
  if (cachedDevice !== undefined) return cachedDevice;
  const paths = [
    "/root/.openclaw/identity/device.json",
    `${process.env.HOME ?? ""}/.openclaw/identity/device.json`,
  ];
  for (const p of paths) {
    if (!p || p === "/.openclaw/identity/device.json") continue;
    try {
      if (fs.existsSync(p)) {
        cachedDevice = JSON.parse(fs.readFileSync(p, "utf-8")) as DeviceIdentity;
        return cachedDevice;
      }
    } catch {
      /* try next path */
    }
  }
  cachedDevice = null;
  return null;
}

function buildSignString(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
}): string {
  return [
    "v2",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token || "",
    params.nonce,
  ].join("|");
}

function normalizeWsUrl(url: string): string {
  return url.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
}

/** Always request full operator scopes so device pairing covers delete/patch. */
function scopesForMethod(_method: string): string[] {
  return [...LUME_OPERATOR_SCOPES];
}

export async function callGatewayRpc(
  cfg: GatewayApiConfig,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const timeoutMs = cfg.timeoutMs ?? 15_000;
  const wsUrl = normalizeWsUrl(cfg.url);
  const reqId = `lume-gw-${reqCounter++}`;
  const scopes = scopesForMethod(method);

  return new Promise((resolve, reject) => {
    let settled = false;
    let connected = false;
    const ws = new WebSocket(wsUrl);
    const device = loadDeviceIdentity();
    const useDeviceAuth = !!device;
    const clientId = useDeviceAuth ? "gateway-client" : "webchat";
    const clientMode = useDeviceAuth ? "backend" : "webchat";
    const role = "operator";
    const token = cfg.token;

    const finish = (err?: Error, payload?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(payload ?? {});
    };

    const timer = setTimeout(() => {
      finish(new Error(`Gateway RPC timeout: ${method}`));
    }, timeoutMs);

    ws.on("error", (err) => finish(err instanceof Error ? err : new Error(String(err))));
    ws.on("close", () => {
      if (!settled) finish(new Error("Gateway WS closed before response"));
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (!connected && msg.type === "event" && msg.event === "connect.challenge") {
          const payload = msg.payload as Record<string, unknown> | undefined;
          const nonce = payload?.nonce;
          if (typeof nonce !== "string" || !nonce) {
            finish(new Error("Gateway challenge missing nonce"));
            return;
          }

          const connectParams: Record<string, unknown> = {
            minProtocol: 4,
            maxProtocol: 4,
            client: {
              id: clientId,
              displayName: "Lume Plugin",
              version: "1.0.0",
              platform: "linux",
              mode: clientMode,
            },
            role,
            scopes,
            auth: { token },
            locale: "zh-CN",
          };

          if (useDeviceAuth && device) {
            const signedAtMs = Date.now();
            const signStr = buildSignString({
              deviceId: device.deviceId,
              clientId,
              clientMode,
              role,
              scopes,
              signedAtMs,
              token,
              nonce,
            });
            try {
              const privateKey = crypto.createPrivateKey(device.privateKeyPem);
              const signature = crypto.sign(null, Buffer.from(signStr), privateKey);
              connectParams.device = {
                id: device.deviceId,
                publicKey: device.publicKeyPem,
                signature: signature.toString("base64"),
                signedAt: signedAtMs,
                nonce,
              };
            } catch (err) {
              finish(err instanceof Error ? err : new Error(String(err)));
              return;
            }
          }

          ws.send(JSON.stringify({ type: "req", id: "connect", method: "connect", params: connectParams }));
          return;
        }

        if (!connected && msg.id === "connect" && msg.type === "res") {
          if (!msg.ok) {
            finish(new Error(`Gateway connect failed: ${JSON.stringify(msg.error)}`));
            return;
          }
          connected = true;
          ws.send(JSON.stringify({ type: "req", id: reqId, method, params }));
          return;
        }

        if (msg.id === reqId && msg.type === "res") {
          if (!msg.ok) {
            finish(
              new Error(
                typeof msg.error === "object"
                  ? JSON.stringify(msg.error)
                  : String(msg.error ?? "Gateway RPC failed"),
              ),
            );
            return;
          }
          finish(undefined, (msg.payload ?? {}) as Record<string, unknown>);
        }
      } catch {
        /* ignore malformed frames */
      }
    });
  });
}
