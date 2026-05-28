/**
 * 获取用户活跃设备的工具函数
 * 根据 user.activeServerId 找到对应的服务器配置
 */

/**
 * 获取用户的活跃服务器
 * @param {object} db - 数据库对象
 * @param {string} userId - 用户 ID
 * @returns {object|null} 服务器配置
 */
export function getActiveServer(db, userId) {
  if (!db.userServers || !userId) return null;
  
  const user = db.users?.find(u => u.id === userId);
  if (!user) return null;
  
  // 优先用 activeServerId 查找
  if (user.activeServerId) {
    const server = db.userServers.find(s => s.userId === userId && s.id === user.activeServerId);
    if (server) return server;
  }
  
  // 兜底：找该用户的第一台服务器
  const first = db.userServers.find(s => s.userId === userId);
  return first || null;
}

/**
 * 获取用户所有服务器
 */
export function getUserServers(db, userId) {
  if (!db.userServers || !userId) return [];
  return db.userServers.filter(s => s.userId === userId);
}
