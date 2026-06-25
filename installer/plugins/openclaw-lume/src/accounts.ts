/**
 * Lume channel plugin — account resolution helpers
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { LumeAccount } from "./types.js";

const CHANNEL_KEY = "lume";
const DEFAULT_PORT = 18790;

/**
 * List all account IDs configured under channels.lume.accounts.
 * If no named accounts exist, returns ["default"] when top-level config is present.
 */
export function listLumeAccountIds(_cfg: OpenClawConfig): string[] {
  const section = getLumeSection(_cfg);
  if (!section) return [];

  // Named accounts under channels.lume.accounts
  const accounts = section.accounts as Record<string, unknown> | undefined;
  if (accounts && typeof accounts === "object" && Object.keys(accounts).length > 0) {
    return Object.keys(accounts);
  }

  // Single/default account from top-level fields
  if (section.secret || section.port) {
    return ["default"];
  }

  return [];
}

/**
 * Resolve an account from config.
 */
export function resolveLumeAccount(cfg: OpenClawConfig, accountId?: string | null): LumeAccount {
  const section = getLumeSection(cfg);
  if (!section) {
    throw new Error("lume: no configuration found under channels.lume");
  }

  const id = accountId ?? "default";

  // Try named account first
  if (id !== "default") {
    const accounts = section.accounts as Record<string, Record<string, unknown>> | undefined;
    const acct = accounts?.[id];
    if (acct) {
      return {
        accountId: id,
        port: typeof acct.port === "number" ? acct.port : (typeof section.port === "number" ? section.port : DEFAULT_PORT),
        secret: typeof acct.secret === "string" ? acct.secret : (typeof section.secret === "string" ? section.secret : ""),
        allowedOrigins: parseAllowedOrigins(acct.allowedOrigins) ?? parseAllowedOrigins(section.allowedOrigins) ?? [],
        enabled: acct.enabled !== false,
        configured: Boolean(acct.secret || section.secret),
      };
    }
  }

  // Default / top-level account
  return {
    accountId: id,
    port: typeof section.port === "number" ? section.port : DEFAULT_PORT,
    secret: typeof section.secret === "string" ? section.secret : "",
    allowedOrigins: parseAllowedOrigins(section.allowedOrigins) ?? [],
    enabled: section.enabled !== false,
    configured: Boolean(section.secret),
  };
}

function getLumeSection(cfg: OpenClawConfig): Record<string, unknown> | null {
  const channels = (cfg as Record<string, unknown>).channels;
  if (!channels || typeof channels !== "object") return null;
  const lume = (channels as Record<string, unknown>)[CHANNEL_KEY];
  if (!lume || typeof lume !== "object") return null;
  return lume as Record<string, unknown>;
}

function parseAllowedOrigins(val: unknown): string[] | null {
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string");
  return null;
}
