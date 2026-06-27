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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

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

// AI 代理
import aiProxyRoutes from './routes/ai-proxy.js';
app.use('/api/ai', aiProxyRoutes);
app.use('/api/gateway', gatewayRoutes);

import serversRoutes from './routes/servers.js';
app.use('/api/servers', serversRoutes);

import remoteConfigRoutes from './routes/remote-config.js';
app.use('/api/remote-config', remoteConfigRoutes);

import deployRoutes from './routes/deploy.js';
app.use('/api/deploy', deployRoutes);

import batchUpdateRoutes from './routes/batch-update.js';
app.use('/api/batch-update', batchUpdateRoutes);

// 模型管理
import modelRoutes from './routes/models.js';
app.use('/api/models', modelRoutes);

// 基因系统
import genesRoutes from './routes/genes.js';
app.use('/api/genes', genesRoutes);

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
app.use('/api/user', userRoutes);

// 图片上传
import uploadRoutes from './routes/upload.js';
import speechRoutes from './routes/speech.js';
app.use('/api/upload', uploadRoutes);
app.use('/api/speech', speechRoutes);

// 文件代理（从用户实例拉取文件）
import filesRoutes from './routes/files.js';
app.use('/api/files', filesRoutes);

// LumeClaw 维护 Agent
import lumeclawRoutes from './routes/lumeclaw.js';
app.use('/api/lumeclaw', lumeclawRoutes);

// Lume WS REST 路由（connect-info 等）
import lumeWsRoutes from './routes/lume-ws.js';
app.use('/api/lume', lumeWsRoutes);

// 健康检查路由
import healthcheckRoutes from './routes/healthcheck.js';
app.use('/api/healthcheck', healthcheckRoutes);

import agentWorkspaceRoutes from './routes/agent-workspace.js';
app.use('/api/agent-workspace', agentWorkspaceRoutes);

import downloadsRoutes from './routes/downloads.js';
app.use('/api/downloads', downloadsRoutes);

// 用户模型列表（前端模型选择器用）
app.get('/api/user-models', (req, res) => {
  res.json({
    availableModels: [
      { id: 'auto', name: 'Auto', provider: '系统', desc: '智能选择', tier: 'free' },
      { id: 'glm-cn/glm-5.1', name: 'GLM-5.1', provider: '智谱', desc: '主力', tier: 'pro' },
      { id: 'gh/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', desc: '经典', tier: 'pro' },
      { id: 'gh/gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI', desc: '强推理', tier: 'pro' },
      { id: 'gh/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI', desc: '快速', tier: 'free' },
      { id: 'openrouter/openrouter/free', name: 'Free', provider: 'OpenRouter', desc: '免费', tier: 'free' },
      { id: 'cu/default', name: 'Cursor Auto', provider: 'Cursor', desc: '智能', tier: 'pro' },
      { id: 'cu/gpt-5.2', name: 'GPT-5.2', provider: 'Cursor', desc: '旗舰', tier: 'pro' },
      { id: 'cu/claude-4.5-sonnet', name: 'Claude 4.5 Sonnet', provider: 'Cursor', desc: '平衡', tier: 'pro' },
      { id: 'cu/claude-4.5-opus-high', name: 'Claude 4.5 Opus', provider: 'Cursor', desc: '旗舰', tier: 'pro' },
      { id: 'cu/claude-4.6-opus-max', name: 'Claude 4.6 Opus Max', provider: 'Cursor', desc: '最强', tier: 'pro' },
    ]
  });
});

// 托管上传的图片
import { fileURLToPath as fileURLToPath2 } from 'url';
import { dirname as dirname2, join as join2 } from 'path';
const __dirname2 = dirname2(fileURLToPath2(import.meta.url));
app.use('/uploads', express.static(join2(__dirname2, '../uploads')));

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

// 设置 Lume WebSocket 代理（Gateway 优先，Lume 插件可选回退）
import { setupLumeWebSocketProxy } from './routes/lume-ws-proxy.js';
setupLumeWebSocketProxy(app);

// 启动服务
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 灵犀云后端服务已启动: http://localhost:${PORT}`);
  console.log(`📝 健康检查: http://localhost:${PORT}/health`);
});


export default app;

