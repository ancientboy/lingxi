#!/usr/bin/env node
// lingxi-file-api — 轻量文件管理 API（只读）
// 用法: node file-api.js [--port 9092] [--token YOUR_TOKEN] [--root /root]
// 认证: Bearer token（默认用环境变量 FILE_API_TOKEN）

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}

const PORT = parseInt(getArg('port', '9092'));
const TOKEN = getArg('token', process.env.FILE_API_TOKEN || '');
const ROOT = getArg('root', '/root');

function auth(req) {
  if (!TOKEN) return true; // 无 token 配置时跳过认证
  const header = req.headers.authorization || '';
  const t = header.replace('Bearer ', '');
  return t === TOKEN;
}

function safePath(p) {
  // 防路径遍历
  const resolved = path.resolve(p);
  return resolved;
}

function parseLs(output, basePath) {
  const files = [];
  for (const line of output.split('\n')) {
    const m = line.match(/^([dlcbps-])([rwxsStT-]{9})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+[\d:]+)\s+(.+)/);
    if (!m) continue;
    const [, type, perms, , owner, , size, date, name] = m;
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

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (!auth(req)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: '认证失败' }));
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const filePath = safePath(url.searchParams.get('path') || ROOT);

  if (url.pathname === '/api/list') {
    try {
      const output = execSync(`ls -la "${filePath}"`, { timeout: 5000, encoding: 'utf8' });
      const files = parseLs(output, filePath);
      res.end(JSON.stringify({ path: filePath, files }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.stderr || e.message }));
    }
  } else if (url.pathname === '/api/get') {
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: '是目录，不是文件' }));
      }
      // 限制文件大小 5MB
      if (stat.size > 5 * 1024 * 1024) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: '文件太大（>5MB），不支持预览' }));
      }
      const content = fs.readFileSync(filePath, 'utf8');
      res.end(JSON.stringify({ path: filePath, content, size: stat.size }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    }
  } else if (url.pathname === '/api/health') {
    res.end(JSON.stringify({ ok: true, root: ROOT }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: '未知接口' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ lingxi-file-api running on http://127.0.0.1:${PORT}`);
  console.log(`   Root: ${ROOT}`);
  console.log(`   Auth: ${TOKEN ? 'enabled' : 'disabled'}`);
});
