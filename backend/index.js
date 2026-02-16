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

// 用户管理（MVP 暂时跳过）
// import userRoutes from './routes/user.js';
// app.use('/api/user', userRoutes);

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
