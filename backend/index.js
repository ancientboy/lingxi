/**
 * 灵犀云后端服务
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config({ path: require('path').join(require('path').dirname(require('url').fileURLToPath(import.meta.url)), '.env') });

import express from 'express';
import cors from 'cors';
import expressWs from 'express-ws';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDB, saveDB } from './utils/db.js';
import { getAvailableModelsList } from './utils/available-models.js';
import { sanitizePreferredModel } from './utils/model-route.js';
import { config } from './config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = config.security.jwtSecret;

// WebSocket（Gateway + Lume 代理）
expressWs(app);

app.use(cors());
app.use(express.json());

app.use(express.static(join(__dirname, '../frontend'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml');
  res.sendFile(join(__dirname, '../frontend/favicon.svg'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 模型列表（聊天页模型选择器）
app.get('/api/user-models', (req, res) => {
  res.json({ availableModels: getAvailableModelsList() });
});

app.get('/api/user-models/preference', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: '未登录' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDB();
    const user = db.users.find((u) => u.id === decoded.userId);
    if (!user) return res.status(404).json({ success: false, error: '用户不存在' });
    res.json({ success: true, preferredModel: user.preferredModel || 'auto' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/user-models/preference', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: '未登录' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDB();
    const user = db.users.find((u) => u.id === decoded.userId);
    if (!user) return res.status(404).json({ success: false, error: '用户不存在' });
    const model = sanitizePreferredModel(req.body?.model);
    user.preferredModel = model;
    await saveDB(db);
    res.json({ success: true, model: model || 'auto' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

import instanceRoutes from './routes/instance.js';
app.use('/api/instance', instanceRoutes);

import agentRoutes from './routes/agents.js';
app.use('/api/agents', agentRoutes);

import skillsRoutes from './routes/skills.js';
app.use('/api/skills', skillsRoutes);

import authRoutes from './routes/auth.js';
app.use('/api/auth', authRoutes);

import feishuRoutes from './routes/feishu.js';
app.use('/api/feishu', feishuRoutes);

import wecomRoutes from './routes/wecom.js';
app.use('/api/wecom', wecomRoutes);

import chatRoutes from './routes/chat.js';
app.use('/api/chat', chatRoutes);

import adminRoutes from './routes/admin.js';
app.use('/api/admin', adminRoutes);

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

import genesRoutes from './routes/genes.js';
app.use('/api/genes', genesRoutes);

import memoryRoutes from './routes/memory.js';
app.use('/api/memory', memoryRoutes);

import cronRoutes from './routes/cron.js';
app.use('/api/cron', cronRoutes);

import loopsRoutes from './routes/loops.js';
app.use('/api/loops', loopsRoutes);

import subscriptionRoutes from './routes/subscription.js';
app.use('/api/subscription', subscriptionRoutes);

import userRoutes from './routes/user.js';
app.use('/api/user', userRoutes);

import lumeWsRoutes from './routes/lume-ws.js';
app.use('/api/lume', lumeWsRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

import { setupWebSocketProxy } from './routes/ws-proxy.js';
import { setupLumeWebSocketProxy } from './routes/lume-ws-proxy.js';
setupWebSocketProxy(app);
setupLumeWebSocketProxy(app);

const server = app.listen(PORT, () => {
  console.log(`🚀 灵犀云后端服务已启动: http://localhost:${PORT}`);
  console.log(`📝 健康检查: http://localhost:${PORT}/health`);
});

export default app;
