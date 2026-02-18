/**
 * 灵犀云后端服务
 * 
 * 功能：
 * - 实例管理（创建、分配、重启）
 * - Agent 配置
 * - 用户管理
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 托管前端静态文件
app.use(express.static(join(__dirname, '../frontend')));

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

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: err.message || 'Internal Server Error' 
  });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`🚀 灵犀云后端服务已启动: http://localhost:${PORT}`);
  console.log(`📝 健康检查: http://localhost:${PORT}/health`);
});

export default app;
