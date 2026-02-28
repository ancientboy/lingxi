/**
 * 灵犀云后端服务
 * 
 * 功能：
 * - 实例管理（创建、分配、重启）
 * - Agent 配置
 * - 用户管理
 */

// 🚨 必须在最开始加载环境变量（ES Module 方式）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config({ path: require('path').join(require('path').dirname(require('url').fileURLToPath(import.meta.url)), '.env') });

import express from 'express';
import cors from 'cors';
import expressWs from 'express-ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 🔌 初始化 WebSocket 支持（必须在路由之前）
expressWs(app);

// 中间件
app.use(cors());
app.use(express.json());

// 托管前端静态文件（禁用 HTML 缓存）
app.use(express.static(join(__dirname, '../frontend'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// ============ 路由 ============

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 实例管理
import instanceRoutes from './routes/instance.js';
app.use('/api/instance', instanceRoutes);

// Agent 配置
import agentRoutes from './routes/agents.js';
app.use('/api/agents', agentRoutes);

// Skills 管理
import skillsRoutes from './routes/skills.js';
app.use('/api/skills', skillsRoutes);

// 认证（邀请码注册/登录）
import authRoutes from './routes/auth.js';
app.use('/api/auth', authRoutes);

// 飞书配置
import feishuRoutes from './routes/feishu.js';
app.use('/api/feishu', feishuRoutes);

// 企业微信配置
import wecomRoutes from './routes/wecom.js';
app.use('/api/wecom', wecomRoutes);

// 聊天代理
import chatRoutes from './routes/chat.js';
app.use('/api/chat', chatRoutes);

// 管理接口（生成邀请码等）
import adminRoutes from './routes/admin.js';
app.use('/api/admin', adminRoutes);

// Gateway 代理（安全获取连接信息）
import gatewayRoutes from './routes/gateway.js';
app.use('/api/gateway', gatewayRoutes);

import serversRoutes from './routes/servers.js';
app.use('/api/servers', serversRoutes);

import remoteConfigRoutes from './routes/remote-config.js';
app.use('/api/remote-config', remoteConfigRoutes);

import deployRoutes from './routes/deploy.js';
app.use('/api/deploy', deployRoutes);

import batchUpdateRoutes from './routes/batch-update.js';
app.use('/api/batch-update', batchUpdateRoutes);

// 基因系统
import genesRoutes from './routes/genes.js';
app.use('/api/genes', genesRoutes);

// 技能库同步定时任务
import { startCronJob } from './skills/sync-cron.mjs';
startCronJob('0 0 * * 0'); // 每周日中午12点同步

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: err.message || 'Internal Server Error' 
  });
});

// 设置 WebSocket 代理（必须在 app.listen 之前）
import { setupWebSocketProxy } from './routes/ws-proxy.js';
setupWebSocketProxy(app);

// 启动服务
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 灵犀云后端服务已启动: http://localhost:${PORT}`);
  console.log(`📝 健康检查: http://localhost:${PORT}/health`);
});


export default app;
