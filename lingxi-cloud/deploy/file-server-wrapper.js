/**
 * OpenClaw 用户实例文件服务
 *
 * 自动检测 OpenClaw workspace 目录
 * 端口: 9876
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.FILE_SERVER_PORT || 9876;

// 🔍 自动检测 OpenClaw workspace 目录
function detectWorkspaceDir() {
  // 1. 检查环境变量
  if (process.env.WORKSPACE_DIR) {
    return process.env.WORKSPACE_DIR;
  }

  // 2. 检查常见位置
  const possiblePaths = [
    '/root/.openclaw/workspace',
    path.join(process.env.HOME || '/root', '.openclaw', 'workspace'),
    '/data/openclaw/workspace',
    '/workspace'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log(`✅ 找到 workspace 目录: ${p}`);
      return p;
    }
  }

  // 3. 使用 pm2 进程信息推断
  try {
    const pm2List = execSync('pm2 jlist', { encoding: 'utf8' });
    const processes = JSON.parse(pm2List);

    const openclawProcess = processes.find(p =>
      p.name?.includes('openclaw') || p.pm_cwd?.includes('openclaw')
    );

    if (openclawProcess && openclawProcess.pm_cwd) {
      const workspacePath = path.join(openclawProcess.pm_cwd, 'workspace');
      if (fs.existsSync(workspacePath)) {
        console.log(`✅ 从 pm2 推断 workspace 目录: ${workspacePath}`);
        return workspacePath;
      }
    }
  } catch (err) {
    console.warn('⚠️  无法从 pm2 推断目录:', err.message);
  }

  // 4. 默认使用当前目录的 workspace
  const defaultPath = path.join(__dirname, 'workspace');
  console.log(`⚠️  使用默认目录: ${defaultPath}`);

  // 如果目录不存在，创建它
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
    console.log(`📁 已创建目录: ${defaultPath}`);
  }

  return defaultPath;
}

const WORKSPACE_DIR = detectWorkspaceDir();

console.log(`\n🚀 OpenClaw 文件服务启动中...`);
console.log(`📂 Workspace 目录: ${WORKSPACE_DIR}`);
console.log(`🔌 监听端口: ${PORT}\n`);

// CORS 设置
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-file-token');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    workspace: WORKSPACE_DIR,
    exists: fs.existsSync(WORKSPACE_DIR)
  });
});

/**
 * GET /files/*
 * 静态文件访问
 */
app.use('/files', express.static(WORKSPACE_DIR, {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json'
    };

    if (contentTypes[ext]) {
      res.setHeader('Content-Type', contentTypes[ext]);
    }
  }
}));

// 启动服务
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 文件服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`🔗 预览示例: http://localhost:${PORT}/files/image.png\n`);
});
