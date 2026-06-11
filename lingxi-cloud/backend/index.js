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
import fs from 'fs';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 🔌 初始化 WebSocket 支持（必须在路由之前）
expressWs(app);

// 中间件
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// 托管上传的图片/文件（必须在 frontend static 之前，否则 /uploads 会被 frontend 拦截）
app.use('/uploads', express.static(join(__dirname, '../uploads')));

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

// 托管管理后台静态文件
app.use('/admin', express.static(join(__dirname, '../admin-frontend/dist'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// 管理后台 SPA 路由回退
app.get('/admin/*', (req, res) => {
  res.sendFile(join(__dirname, '../admin-frontend/dist/index.html'));
});

// 📱 托管 APK 下载文件
app.use('/downloads', express.static(join(__dirname, './downloads'), {
  setHeaders: (res) => {
    res.setHeader('Content-Disposition', 'attachment');
  }
}));

// ============ 路由 ============

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// APK 下载（简洁路径）
app.get('/lingxi.apk', (req, res) => {
  const apkPath = join(__dirname, '../frontend/public/lingxi.apk');
  res.download(apkPath, 'lingxi.apk');
});

// 测试版 APK 下载
app.get('/lingxi-test.apk', (req, res) => {
  const apkPath = join(__dirname, '../frontend/public/lingxi-test.apk');
  res.download(apkPath, 'lingxi-test.apk');
});

// 极简版 APK 下载
app.get('/lingxi-minimal.apk', (req, res) => {
  const apkPath = join(__dirname, '../frontend/public/lingxi-minimal.apk');
  res.download(apkPath, 'lingxi-minimal.apk');
});

// 实例管理
import instanceRoutes from './routes/instance.js';
app.use('/api/instance', instanceRoutes);

// Agent 配置
import agentRoutes from './routes/agents.js';
app.use('/api/agents', agentRoutes);

// 团队管理
import teamRoutes from './routes/team.js';
app.use('/api/team', teamRoutes);

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

// 管理后台 API（新版，替代旧 admin.js）
import adminPanelRoutes from './routes/admin/index.js';
app.use('/api/admin', adminPanelRoutes);

// Gateway 代理（安全获取连接信息）
import gatewayRoutes from './routes/gateway.js';

// AI 代理
import aiProxyRoutes from './routes/ai-proxy.js';
app.use('/api/ai', aiProxyRoutes);
app.use('/api/gateway', gatewayRoutes);

import serversRoutes from './routes/servers.js';
app.use('/api/servers', serversRoutes);

import remoteConfigRoutes from './routes/remote-config.js';
app.use('/api/remote-config', remoteConfigRoutes);

// 用户模型偏好（公开接口）
app.get('/api/user-models', (req, res) => {
  res.json({
    availableModels: getAvailableModelsList(),
  });
});

// 获取用户模型偏好（需要登录）
app.get('/api/user-models/preference', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    const jwtSecret = process.env.JWT_SECRET || 'lingxi-cloud-secret-2026';
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'token 无效' });
    }
    const dbPath = join(__dirname, 'data/db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const user = db.users.find(u => u.id === userId);
    const preferredModel = user?.preferredModel || 'auto';
    res.json({ success: true, preferredModel });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 用户模型偏好设置（需要登录）
app.post('/api/user-models/preference', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    // 验证 token 获取 userId
    const jwtSecret = process.env.JWT_SECRET || 'lingxi-cloud-secret-2026';
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'token 无效' });
    }
    const { model } = req.body;
    
    // 写入 db.json
    const dbPath = join(__dirname, 'data/db.json');
    const raw = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(raw);
    const user = db.users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    user.preferredModel = model || null;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    
    console.log(`[模型偏好] ✅ 用户 ${user.nickname || userId} → ${model || 'auto'}`);
    // 🔥 同进程直接刷新，不再需要 HTTP 通知
    loadUserPreferences();
    res.json({ success: true, model: model || 'auto' });
  } catch(e) {
    console.error('[模型偏好] 更新失败:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

import deployRoutes from './routes/deploy.js';
app.use('/api/deploy', deployRoutes);

import batchUpdateRoutes from './routes/batch-update.js';
app.use('/api/batch-update', batchUpdateRoutes);

// 基因系统
import genesRoutes from './routes/genes.js';
app.use('/api/genes', genesRoutes);

// Cron 定时任务代理
import cronRoutes from './routes/cron.js';
app.use('/api/cron', cronRoutes);

// 记忆系统
import memoryRoutes from './routes/memory.js';
app.use('/api/memory', memoryRoutes);

// 触发器系统
import triggerRoutes from './routes/triggers.js';
app.use('/api/triggers', triggerRoutes);

// Webhook 入口（不需要鉴权）—— 使用 raw body 解析以支持签名验证
import webhookRoutes from './routes/webhook.js';
app.use('/api/webhook', express.json({ limit: '2mb', verify: function(req, res, buf, encoding) { req.rawBody = buf.toString(encoding || 'utf8'); } }), webhookRoutes);

import userRoutes from './routes/user.js';

// 用户服务器信息
import userServerInfoRoutes from './routes/user-server-info.js';
app.use('/api/user', userServerInfoRoutes);

// 订阅管理
import subscriptionRoutes from './routes/subscription.js';
import stripeRoutes from './routes/stripe.js';
import alipayRoutes from './routes/alipay.js';
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/alipay', alipayRoutes);

// 服务器健康巡检
import healthcheckRoutes from './routes/healthcheck.js';
app.use('/api/healthcheck', healthcheckRoutes);

// 智能提醒系统
import reminderRoutes, { checkReminders } from './routes/reminders.js';
app.use('/api/reminders', reminderRoutes);

// 提醒自动检查（每 60 秒）
setInterval(async function() {
  try {
    await checkReminders();
  } catch (err) {
    console.error('[提醒] 自动检查出错:', err.message);
  }
}, 60000);
console.log('⏰ 提醒自动检查已启动: 每 60 秒检查一次');
app.use('/api/user', userRoutes);

// 图片上传
import uploadRoutes from './routes/upload.js';
import speechRoutes from './routes/speech.js';
app.use('/api/upload', uploadRoutes);
app.use('/api/speech', speechRoutes);

// 文件代理（从用户实例拉取文件）
import filesRoutes from './routes/files.js';
app.use('/api/files', filesRoutes);

// 文件下载（安全下载，不暴露 IP）
import downloadsRoutes from './routes/downloads.js';
app.use('/api/downloads', downloadsRoutes);

// LumeClaw 维护 Agent
import lumeclawRoutes from './routes/lumeclaw.js';
app.use('/api/lumeclaw', lumeclawRoutes);

// Agent 办公区
import agentWorkspaceRoutes from './routes/agent-workspace.js';
app.use('/api/agent-workspace', agentWorkspaceRoutes);

// 文件管理器（浏览用户 OpenClaw workspace）
import fileExplorerRoutes from './routes/file-explorer.js';
app.use('/api/file-explorer', fileExplorerRoutes);

// 知识库管理
import knowledgeRoutes from './routes/knowledge.js';
app.use('/api/knowledge', knowledgeRoutes);

// Agent 市场
import marketRoutes from './routes/market.js';
app.use('/api/market', marketRoutes);

// (uploads static moved to top)

// 技能库同步定时任务
import { startCronJob } from './skills/sync-cron.mjs';
startCronJob('0 0 * * 0'); // 每周日中午12点同步

// 临时文件清理定时任务（每天凌晨2点）
import cron from 'node-cron';
import { cleanupTempFiles } from './routes/files.js';
cron.schedule('0 2 * * *', () => {
  console.log('🕒 开始清理临时文件...');
  cleanupTempFiles();
}, {
  timezone: 'Asia/Shanghai'
});
console.log('⏰ 临时文件清理任务已启动: 每天凌晨2点');

// 服务器定时巡检（每 30 分钟）
import { runHealthCheckForUser } from './routes/healthcheck.js';
var HEALTHCHECK_INTERVAL = 30 * 60 * 1000; // 30 分钟

async function runAutoHealthCheck() {
  try {
    var db = await getDB();
    if (!db.userServers || db.userServers.length === 0) return;

    // 收集有服务器的用户 ID（去重）
    var userIds = [...new Set(db.userServers.map(function(s) { return s.userId; }))];

    var totalServers = 0;
    var changedServers = 0;

    for (var i = 0; i < userIds.length; i++) {
      var results = await runHealthCheckForUser(db, userIds[i]);
      totalServers += results.length;
      changedServers += results.filter(function(r) { return r.changed; }).length;
    }

    if (totalServers > 0) {
      cleanupOldData(db);
      await saveDB(db);
      console.log('[巡检] 自动巡检完成: ' + totalServers + ' 台服务器, ' + changedServers + ' 台状态变化');
    }
  } catch (err) {
    console.error('[巡检] 自动巡检出错:', err.message);
  }
}

// 启动后延迟 60 秒执行第一次巡检，然后每 30 分钟一次
setTimeout(function() {
  console.log('🏥 服务器自动巡检已启动: 每 30 分钟一次');
  runAutoHealthCheck();
  setInterval(runAutoHealthCheck, HEALTHCHECK_INTERVAL);
}, 60 * 1000);

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

// ============ 合并 AI 代理路由 ============
import http from 'http';
import {
  server as aiProxyServer,
  loadUserPreferences,
  getAvailableModelsList,
} from './ai-proxy-lite.js';

// 初始化用户偏好映射
loadUserPreferences();

// 挂载 AI 代理的所有路由到 Express（同进程，0 延迟）
app.use('/api/ai/:provider', (req, res) => {
  // 将 Express 请求转发到 ai-proxy 的 http server handler
  aiProxyServer.emit('request', req, res);
});

// 挂载 /v1/chat/completions 兼容路径
app.use('/v1/chat/completions', (req, res) => {
  aiProxyServer.emit('request', req, res);
});
app.use('/chat/completions', (req, res) => {
  aiProxyServer.emit('request', req, res);
});

// 挂载 /v1/models 兼容路径
app.use('/v1/models', (req, res) => {
  aiProxyServer.emit('request', req, res);
});

// 代理内部管理接口
app.use('/api/proxy-keys', (req, res) => {
  // Rewrite path for the internal server
  req.url = req.url.replace('/api/proxy-keys', '/api/keys');
  aiProxyServer.emit('request', req, res);
});
app.use('/api/proxy-stats', (req, res) => {
  req.url = req.url.replace('/api/proxy-stats', '/api/stats');
  aiProxyServer.emit('request', req, res);
});
app.use('/proxy-health', (req, res) => {
  req.url = '/health';
  aiProxyServer.emit('request', req, res);
});

// 启动服务
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 灵犀云后端服务已启动: http://localhost:${PORT}`);
  console.log(`📝 健康检查: http://localhost:${PORT}/health`);
});

// 额外监听 13000 端口（用户 OpenClaw 已配置此端口，零改动）
const AI_PORT = process.env.AI_PROXY_PORT || 13000;
const aiPortServer = http.createServer((req, res) => {
  // 直接复用 ai-proxy 的 http handler
  aiProxyServer.emit('request', req, res);
});
aiPortServer.listen(AI_PORT, '0.0.0.0', () => {
  console.log(`🔌 AI 代理端口已启动: http://localhost:${AI_PORT} (用户零改动)`);
});


export default app;


// TTS 路由
import ttsRouter from './routes/tts.js';
app.use('/api/tts', ttsRouter);

// 服务器健康检查定时任务（由下方的自动巡检模块统一管理）
// 旧的 health-check.js 仅保留 runHealthCheck() 供手动调用
// startHealthCheckScheduler() 已被下方 healthcheck.js 的自动巡检替代
