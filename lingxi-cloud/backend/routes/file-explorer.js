import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { Client } from 'ssh2';
import axios from 'axios';

const router = Router();

/**
 * SSH 执行命令
 */
function sshExec(server, command, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let errorOutput = '';

    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('SSH timeout'));
    }, timeout);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }
        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', (data) => { errorOutput += data.toString(); });
        stream.on('close', () => {
          clearTimeout(timer);
          conn.end();
          if (errorOutput && !output) reject(new Error(errorOutput.trim()));
          else resolve(output);
        });
      });
    });

    conn.on('error', (e) => { clearTimeout(timer); reject(e); });

    conn.connect({
      host: server.ip,
      port: server.sshPort || 22,
      username: 'root',
      password: server.sshPassword,
      readyTimeout: 5000,
    });
  });
}

/** 安全路径（防注入） */
function safePath(p) {
  return p.replace(/[`$|;&<>()]/g, '').replace(/\.\./g, '');
}

/** GET /api/file-explorer/list?path=/root — 列出目录（SSH 直连，毫秒级） */
router.get('/list', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ error: '没有可用的服务器' });
    if (!server.sshPassword) return res.status(400).json({ error: '该服务器未配置 SSH 凭证' });

    const dirPath = safePath(req.query.path || '/root');
    const output = await sshExec(server, `ls -la "${dirPath}"`);

    const files = parseLsOutput(output, dirPath);
    res.json({ path: dirPath, files });
  } catch (e) {
    console.error('❌ file-explorer/list:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/file-explorer/get?path=/root/file.txt — 读取文件（SSH 直连） */
router.get('/get', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ error: '没有可用的服务器' });
    if (!server.sshPassword) return res.status(400).json({ error: '该服务器未配置 SSH 凭证' });

    const filePath = safePath(req.query.path || '');
    if (!filePath) return res.status(400).json({ error: '缺少 path 参数' });

    const content = await sshExec(server, `cat "${filePath}"`, 10000);
    res.json({ path: filePath, content });
  } catch (e) {
    console.error('❌ file-explorer/get:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * 解析 ls -la 输出
 */
function parseLsOutput(output, basePath) {
  const files = [];
  for (const line of output.split('\n')) {
    const m = line.match(/^([dlcbps-])([rwxsStT-]{9})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+[\d:]+)\s+(.+)/);
    if (!m) continue;
    const [, type, perms, , owner, group, size, date, name] = m;
    if (name === '.' || name === '..') continue;
    const isDir = type === 'd';
    files.push({
      name,
      path: basePath === '/' ? `/${name}` : `${basePath}/${name}`,
      isDir,
      size: parseInt(size),
      perms,
      owner,
      date: date.trim(),
    });
  }
  // 目录优先，然后按名称排序
  files.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return files;
}

/** GET /api/file-explorer/filebrowser — 获取 FileBrowser URL（已安装则返回 URL，否则返回安装提示） */
router.get('/filebrowser', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ error: '没有可用的服务器' });

    if (server.fileBrowserPort) {
      res.json({
        installed: true,
        url: `http://${server.ip}:${server.fileBrowserPort}`,
        username: server.fileBrowserUser || 'admin',
      });
    } else {
      res.json({ installed: false });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/file-explorer/install-filebrowser — 远程安装 FileBrowser */
router.post('/install-filebrowser', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ error: '没有可用的服务器' });
    if (!server.sshPassword) return res.status(400).json({ error: '该服务器未配置 SSH 凭证' });

    const port = 9091;
    const password = require('crypto').randomBytes(8).toString('hex');

    const installScript = `
cd /tmp && curl -fsSL https://raw.githubusercontent.com/filebrowser/get/master/get.sh | bash &&
mkdir -p /etc/filebrowser &&
filebrowser config init -d /etc/filebrowser/filebrowser.db &&
filebrowser config set -d /etc/filebrowser/filebrowser.db --address 0.0.0.0 --port ${port} --root /root &&
filebrowser users add admin ${password} --perm.admin -d /etc/filebrowser/filebrowser.db &&
cat > /etc/systemd/system/filebrowser.service << 'EOL'
[Unit]
Description=File Browser
After=network.target
[Service]
ExecStart=/usr/local/bin/filebrowser -d /etc/filebrowser/filebrowser.db
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
EOL
systemctl daemon-reload &&
systemctl enable filebrowser &&
systemctl start filebrowser &&
echo "OK"
`;

    const output = await sshExec(server, installScript, 60000);

    if (output.includes('OK')) {
      // 保存配置
      server.fileBrowserPort = port;
      server.fileBrowserUser = 'admin';
      server.fileBrowserPassword = password;
      const fs = await import('fs');
      const path = await import('path');
      const dbPath = path.join(process.cwd(), 'data/db.json');
      const dbDir = path.dirname(dbPath);
      // 尝试多个可能的 db 路径
      for (const p of ['data/db.json', 'db.json']) {
        if (fs.existsSync(p)) { fs.writeFileSync(p, JSON.stringify(db, null, 2)); }
      }

      res.json({ ok: true, url: `http://${server.ip}:${port}`, username: 'admin', password });
    } else {
      res.status(500).json({ error: '安装失败: ' + output.substring(0, 200) });
    }
  } catch (e) {
    console.error('❌ install-filebrowser:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
