import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { Client } from 'ssh2';

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

/** 安全路径 */
function safePath(p) {
  return p.replace(/[`$|;&<>()]/g, '').replace(/\.\./g, '');
}

/** GET /api/file-explorer/list?path=/root — 列出目录 */
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

/** GET /api/file-explorer/get?path=/root/file.txt — 读取文件 */
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

/** 解析 ls -la 输出 */
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
  files.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return files;
}

export default router;
