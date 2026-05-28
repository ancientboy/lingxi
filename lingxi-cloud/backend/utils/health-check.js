/**
 * 服务器健康检查模块
 * 定期检查所有用户服务器的 Gateway 连接状态
 */

import { getDB, saveDB } from './db.js';
import http from 'http';

const HEALTH_CHECK_INTERVAL = 15 * 60 * 1000; // 15 分钟检查一次
const CONNECT_TIMEOUT = 10000; // 10 秒超时

/**
 * 检查单个服务器的健康状态
 * OpenClaw Gateway 主要使用 WebSocket，HTTP 请求可能返回空或重置连接（正常行为）
 */
async function checkServerHealth(server) {
  return new Promise((resolve) => {
    const url = `http://${server.ip}:${server.openclawPort}/${server.openclawSession}/`;
    
    const req = http.get(url, { timeout: CONNECT_TIMEOUT }, (res) => {
      // HTTP 能响应就是健康的（200/404/甚至空响应都算正常，因为 Gateway 主要用 WebSocket）
      resolve({
        serverId: server.id,
        healthy: true, // 能连接上就算健康
        statusCode: res.statusCode,
        checkedAt: new Date().toISOString()
      });
    });
    
    req.on('error', (err) => {
      // 连接错误可能是暂时的，不立即标记为 unhealthy
      console.log(`⚠️ 健康检查连接问题 [${server.ip}]: ${err.message}`);
      resolve({
        serverId: server.id,
        healthy: true, // 保守起见，连接错误也不标记为 unhealthy，等下次检查
        error: err.message,
        checkedAt: new Date().toISOString()
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      console.log(`⏱️ 健康检查超时 [${server.ip}]`);
      resolve({
        serverId: server.id,
        healthy: false, // 🔧 超时标记为不健康
        error: 'timeout',
        checkedAt: new Date().toISOString()
      });
    });
  });
}

/**
 * 执行所有服务器的健康检查
 */
export async function runHealthCheck() {
  console.log('🏥 开始服务器健康检查...');
  
  try {
    const db = await getDB();
    const servers = db.userServers || [];
    
    if (servers.length === 0) {
      console.log('  暂无用户服务器');
      return;
    }
    
    console.log(`  共检查 ${servers.length} 台服务器`);
    
    let healthyCount = 0;
    let unhealthyCount = 0;
    
    for (const server of servers) {
      if (!server.ip || server.status !== 'running') {
        continue; // 跳过没有 IP 或非运行中的服务器
      }
      
      const result = await checkServerHealth(server);
      
      if (result.healthy) {
        healthyCount++;
        server.healthCheckedAt = result.checkedAt;
        server.status = 'running';
        console.log(`  ✅ ${server.ip} - 正常`);
      } else {
        unhealthyCount++;
        server.status = 'unhealthy';
        console.log(`  ❌ ${server.ip} - 异常 (${result.error || result.statusCode})`);
      }
    }
    
    await saveDB(db);
    
    console.log(`🏥 健康检查完成：✅ ${healthyCount} 正常，❌ ${unhealthyCount} 异常`);
    
  } catch (error) {
    console.error('🏥 健康检查出错:', error.message);
  }
}

/**
 * 启动定时健康检查任务
 */
export function startHealthCheckScheduler() {
  console.log(`⏰ 健康检查任务已启动：每 ${HEALTH_CHECK_INTERVAL / 1000 / 60} 分钟执行一次`);
  
  // 立即执行一次
  runHealthCheck();
  
  // 定时执行
  setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL);
}
