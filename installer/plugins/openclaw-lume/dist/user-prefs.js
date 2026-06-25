/**
 * Read user model preference from Lingxi Cloud db.json (by userId).
 */
import fs from "node:fs";
const DEFAULT_DB_PATH = "/root/.openclaw/workspace/lingxi-cloud/backend/data/db.json";
let cache = null;
const CACHE_TTL_MS = 5_000;
function loadUsers(dbPath) {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_TTL_MS)
        return cache.users;
    const map = new Map();
    try {
        const raw = fs.readFileSync(dbPath, "utf8");
        const db = JSON.parse(raw);
        for (const u of db.users ?? []) {
            if (u.id)
                map.set(u.id, u.preferredModel ?? null);
        }
    }
    catch {
        // db unavailable — fall back to auto
    }
    cache = { at: now, users: map };
    return map;
}
export function getUserPreferredModel(userId, dbPath = DEFAULT_DB_PATH) {
    const users = loadUsers(dbPath);
    return users.get(userId) ?? null;
}
