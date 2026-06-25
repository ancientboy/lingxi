/**
 * Read user model preference from Lingxi Cloud db.json (by userId).
 */
import fs from "node:fs";

const DEFAULT_DB_PATH = "/root/.openclaw/workspace/lingxi-cloud/backend/data/db.json";

let cache: { at: number; users: Map<string, string | null> } | null = null;
const CACHE_TTL_MS = 5_000;

function loadUsers(dbPath: string): Map<string, string | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.users;

  const map = new Map<string, string | null>();
  try {
    const raw = fs.readFileSync(dbPath, "utf8");
    const db = JSON.parse(raw) as { users?: Array<{ id?: string; preferredModel?: string | null }> };
    for (const u of db.users ?? []) {
      if (u.id) map.set(u.id, u.preferredModel ?? null);
    }
  } catch {
    // db unavailable — fall back to auto
  }
  cache = { at: now, users: map };
  return map;
}

export function getUserPreferredModel(userId: string, dbPath = DEFAULT_DB_PATH): string | null {
  const users = loadUsers(dbPath);
  return users.get(userId) ?? null;
}
