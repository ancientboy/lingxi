/**
 * 获取用户活跃设备
 */

export function getActiveServer(db, userId) {
  if (!db.userServers || !userId) return null;

  const user = db.users?.find((u) => u.id === userId);
  if (!user) return null;

  if (user.activeServerId) {
    const server = db.userServers.find((s) => s.userId === userId && s.id === user.activeServerId);
    if (server) return server;
  }

  return db.userServers.find((s) => s.userId === userId) || null;
}

export function getUserServers(db, userId) {
  if (!db.userServers || !userId) return [];
  return db.userServers.filter((s) => s.userId === userId);
}
