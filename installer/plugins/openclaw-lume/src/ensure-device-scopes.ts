/**
 * Ensure the local Lume plugin device has operator scopes needed for
 * sessions.list/history (read), patch/abort (write), and delete (admin).
 *
 * On fresh pairing only operator.read may be approved; this upgrades
 * paired.json locally so sessions.delete works without manual CLI approve.
 */

import fs from "node:fs";
import path from "node:path";

export const LUME_OPERATOR_SCOPES = [
  "operator.read",
  "operator.write",
  "operator.admin",
] as const;

function resolveOpenClawDir(): string {
  const home = process.env.HOME ?? "/root";
  return path.join(home, ".openclaw");
}

function loadDeviceId(openClawDir: string): string | null {
  const identityPath = path.join(openClawDir, "identity", "device.json");
  try {
    if (!fs.existsSync(identityPath)) return null;
    const raw = JSON.parse(fs.readFileSync(identityPath, "utf-8")) as { deviceId?: string };
    return typeof raw.deviceId === "string" && raw.deviceId ? raw.deviceId : null;
  } catch {
    return null;
  }
}

function mergeScopes(existing: unknown): string[] {
  const base = Array.isArray(existing) ? existing.filter((s) => typeof s === "string") : [];
  const merged = new Set<string>([...base, ...LUME_OPERATOR_SCOPES]);
  return [...merged];
}

/**
 * Patch local paired device record when admin/write scopes are missing.
 * Safe to call on every plugin start — no-op when already satisfied.
 */
export function ensureLocalDeviceScopes(log?: { info?: (msg: string) => void; warn?: (msg: string) => void }): void {
  const openClawDir = resolveOpenClawDir();
  const deviceId = loadDeviceId(openClawDir);
  if (!deviceId) return;

  const pairedPath = path.join(openClawDir, "devices", "paired.json");
  if (!fs.existsSync(pairedPath)) return;

  let paired: Record<string, Record<string, unknown>>;
  try {
    paired = JSON.parse(fs.readFileSync(pairedPath, "utf-8")) as Record<string, Record<string, unknown>>;
  } catch (err) {
    log?.warn?.(`lume: failed to read paired devices: ${String(err)}`);
    return;
  }

  const device = paired[deviceId];
  if (!device) return;

  const approved = Array.isArray(device.approvedScopes)
    ? (device.approvedScopes as string[])
    : Array.isArray(device.scopes)
      ? (device.scopes as string[])
      : [];

  const missing = LUME_OPERATOR_SCOPES.filter((s) => !approved.includes(s));
  if (missing.length === 0) return;

  const nextScopes = mergeScopes(approved);
  device.scopes = nextScopes;
  device.approvedScopes = nextScopes;

  const tokens = device.tokens;
  if (tokens && typeof tokens === "object" && !Array.isArray(tokens)) {
    const operatorToken = (tokens as Record<string, Record<string, unknown>>).operator;
    if (operatorToken) {
      operatorToken.scopes = mergeScopes(operatorToken.scopes);
      operatorToken.rotatedAtMs = Date.now();
    }
  }

  try {
    fs.writeFileSync(pairedPath, `${JSON.stringify(paired, null, 2)}\n`, "utf-8");
    log?.info?.(`lume: upgraded device scopes → ${nextScopes.join(", ")}`);
  } catch (err) {
    log?.warn?.(`lume: failed to write paired devices: ${String(err)}`);
  }
}
