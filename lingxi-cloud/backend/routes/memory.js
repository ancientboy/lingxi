/**
 * 记忆系统 API
 *
 * 管理用户的 AI Agent 记忆文件和团队共享记忆（Markdown 格式）。
 *
 * 路由：
 *  GET  /files          — 获取记忆文件列表
 *  GET  /content        — 获取记忆文件内容
 *  GET  /search         — 搜索记忆
 *  GET  /team           — 获取团队共享记忆（从 shared/team-memory.md 解析）
 *  POST /team           — 写入团队共享记忆（追加到 Markdown）
 *  DELETE /team         — 删除团队共享记忆条目
 */

import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { callOpenClawRPC } from '../utils/openclaw-rpc.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// 团队共享记忆 Markdown 文件路径
const TEAM_MEMORY_PATH = '/root/.openclaw/workspace/shared/team-memory.md';

// 所有路由都需要登录
router.use(verifyToken);

// TODO: 提取 resolveServer 和 rpc 到 utils/route-helpers.js（与 cron.js 共用）

// ============ Helpers ============

const ALLOWED_MEMORY_PATH_RE = /^(MEMORY\.md|memory\/[a-zA-Z0-9_\-\.]+\.md)$/;

// 写队列：串行化 read → modify → write，防止并发覆盖
let _writeLock = Promise.resolve();

/**
 * 获取用户服务器信息，支持 serverId 参数
 */
async function resolveServer(req, res) {
  const db = await getDB();
  const serverId = req.query.serverId || req.body?.serverId;
  let userServer = null;

  if (serverId) {
    userServer = db.userServers?.find(s => s.userId === req.user.id && s.id === serverId) || null;
    if (!userServer) {
      res.status(400).json({ success: false, error: '指定的设备不存在' });
      return null;
    }
  } else {
    userServer = getActiveServer(db, req.user.id);
  }

  if (!userServer?.ip) {
    res.status(400).json({ success: false, error: '未配置服务器' });
    return null;
  }

  return userServer;
}

/**
 * 统一 RPC 调用 + 错误处理
 */
async function rpc(res, userServer, method, params = {}, timeout = 10000) {
  try {
    const result = await callOpenClawRPC(userServer, method, params, { timeout });
    if (!result.ok) {
      const errMsg = typeof result.error === 'string'
        ? result.error
        : result.error?.message || JSON.stringify(result.error);
      return res.status(502).json({ success: false, error: errMsg });
    }
    return result;
  } catch (err) {
    if (err.message === 'RPC timeout') {
      return res.status(504).json({ success: false, error: '服务器响应超时' });
    }
    return res.status(502).json({ success: false, error: err.message || 'RPC 调用失败' });
  }
}

/**
 * 安全校验记忆文件路径，防止路径穿越
 */
function sanitizeMemoryPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  // 去掉前导 ./ 或 /
  const cleaned = rawPath.replace(/^\.\/+|^\/+/, '');
  // 只允许 MEMORY.md 和 memory/*.md
  if (!ALLOWED_MEMORY_PATH_RE.test(cleaned)) return null;
  // 二次检查：不包含 ..
  if (cleaned.includes('..')) return null;
  return cleaned;
}

/**
 * 解析团队共享记忆 Markdown 文件
 * 按 ## 分类提取列表项
 */
function parseTeamMemoryMd(content) {
  const categories = [];
  let currentCategory = null;

  for (const line of content.split('\n')) {
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      if (currentCategory) categories.push(currentCategory);
      currentCategory = { name: line.replace('## ', '').trim(), items: [] };
    } else if (line.startsWith('- ') && currentCategory) {
      currentCategory.items.push({ content: line.replace('- ', '').trim() });
    }
    // ### 子分类、空行、引用等忽略
  }
  if (currentCategory) categories.push(currentCategory);
  return categories;
}

/**
 * 读取团队共享记忆文件（原始 Markdown）
 */
async function readTeamMemoryMd() {
  try {
    return await readFile(TEAM_MEMORY_PATH, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * 写入团队共享记忆文件
 */
async function writeTeamMemoryMd(content) {
  const dir = dirname(TEAM_MEMORY_PATH);
  await mkdir(dir, { recursive: true });
  await writeFile(TEAM_MEMORY_PATH, content, 'utf-8');
}

// ============ Routes ============

// GET /api/memory/files — 获取记忆文件列表
router.get('/files', async (req, res) => {
  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  const result = await rpc(res, userServer, 'agents.files.list', { agentId: 'main' }, 10000);
  if (!result) return;

  // 从 agents.files.list 结果中筛选 MEMORY.md 和 memory/*.md
  const allFiles = result.payload?.files || result.payload || [];
  const memoryFiles = allFiles.filter(f => {
    const name = f.name || f.path || '';
    return name === 'MEMORY.md' || (name.startsWith('memory/') && name.endsWith('.md'));
  });

  const files = memoryFiles.map(f => ({
    name: f.name || f.path,
    path: f.name || f.path,
    size: f.size || 0,
    lastModified: f.lastModified || f.modified || f.mtime || null,
  }));

  res.json({ success: true, files });
});

// GET /api/memory/content — 获取记忆文件内容
router.get('/content', async (req, res) => {
  const rawPath = req.query.path;
  const safePath = sanitizeMemoryPath(rawPath);

  if (!safePath) {
    return res.status(400).json({ success: false, error: '无效的文件路径，仅允许 MEMORY.md 或 memory/*.md' });
  }

  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  const result = await rpc(res, userServer, 'agents.files.get', { agentId: 'main', name: safePath }, 10000);
  if (!result) return;

  const content = result.payload?.content || result.payload?.text || result.payload || '';
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const MAX_CONTENT_SIZE = 200 * 1024; // 200KB
  if (contentStr.length > MAX_CONTENT_SIZE) {
    return res.json({
      success: true,
      content: contentStr.substring(0, MAX_CONTENT_SIZE),
      truncated: true,
      totalSize: contentStr.length,
    });
  }
  res.json({ success: true, content: contentStr });
});

// GET /api/memory/search — 搜索记忆
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ success: false, error: '缺少搜索关键词' });
  }
  if (q.length > 200) {
    return res.status(400).json({ success: false, error: '搜索关键词过长' });
  }

  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  // memory_search 通过 HTTP POST /tools/invoke 调用，不是 WebSocket RPC
  try {
    const basePath = userServer.openclawSession || '';
    const fullUrl = basePath
      ? `http://${userServer.ip}:${userServer.openclawPort}/${basePath}/tools/invoke`
      : `http://${userServer.ip}:${userServer.openclawPort}/tools/invoke`;

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userServer.openclawToken ? { 'Authorization': `Bearer ${userServer.openclawToken}` } : {}),
      },
      body: JSON.stringify({ tool: 'memory_search', args: { query: q } }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, error: `搜索服务返回 ${response.status}` });
    }

    const data = await response.json();
    // data 格式: { ok: true, result: { results: [...] } } 或类似结构
    const results = data.result?.results || data.results || data.payload?.results || data.payload || [];
    res.json({ success: true, results });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ success: false, error: '搜索服务响应超时' });
    }
    return res.status(502).json({ success: false, error: err.message || '搜索服务调用失败' });
  }
});

// POST /api/memory/team — 写入团队共享记忆（追加到 Markdown）
router.post('/team', async (req, res) => {
  const trimmedContent = (req.body.content || '').trim();
  if (!trimmedContent) {
    return res.status(400).json({ success: false, error: '内容不能为空' });
  }
  if (trimmedContent.length > 5000) {
    return res.status(400).json({ success: false, error: '内容过长' });
  }
  if (/[\r\n]/.test(trimmedContent)) {
    return res.status(400).json({ success: false, error: '内容不能包含换行' });
  }

  const category = (req.body.category || '').trim();
  if (!category) {
    return res.status(400).json({ success: false, error: '分类不能为空' });
  }
  if (/[\r\n#]/.test(category)) {
    return res.status(400).json({ success: false, error: '分类名不能包含特殊字符' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const line = '- ' + trimmedContent + '（' + today + '）';

  // 写队列串行化，防止并发覆盖
  let writeError = null;
  await new Promise(resolve => {
    _writeLock = _writeLock.then(async () => {
      let md = await readTeamMemoryMd();

      // 找到 ## category 段落
      const lines = md.split('\n');
      let categoryIndex = -1;
      let nextCategoryIndex = lines.length;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === '## ' + category) {
          categoryIndex = i;
        } else if (categoryIndex !== -1 && lines[i].startsWith('## ') && !lines[i].startsWith('### ')) {
          nextCategoryIndex = i;
          break;
        }
      }

      if (categoryIndex !== -1) {
        // 在该分类最后一个列表项后面追加
        let insertAt = nextCategoryIndex;
        // 找到该分类最后一个非空行
        for (let i = nextCategoryIndex - 1; i > categoryIndex; i--) {
          if (lines[i].trim() !== '') {
            insertAt = i + 1;
            break;
          }
        }
        // 如果整个分类只有标题和空行，插在标题后面
        if (insertAt <= categoryIndex + 1) {
          insertAt = categoryIndex + 1;
        }
        lines.splice(insertAt, 0, line);
        md = lines.join('\n');
      } else {
        // 分类不存在，在文件末尾追加新分类
        if (md && !md.endsWith('\n')) md += '\n';
        md += '\n---\n\n## ' + category + '\n\n' + line + '\n';
      }

      await writeTeamMemoryMd(md);
    }).then(resolve).catch(err => { writeError = err; resolve(); });
  });

  if (writeError) {
    return res.status(500).json({ success: false, error: '写入失败: ' + writeError.message });
  }

  res.json({ success: true });
});

// DELETE /api/memory/team — 删除团队共享记忆条目
router.delete('/team', async (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ success: false, error: '缺少要删除的内容' });
  }

  let found = false;
  let writeError = null;
  const targetContent = content.trim();
  const target = '- ' + targetContent;

  // 写队列串行化
  await new Promise(resolve => {
    _writeLock = _writeLock.then(async () => {
      let md = await readTeamMemoryMd();
      if (!md) return;

      const lines = md.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('- ') && line.trim() === target) {
          lines.splice(i, 1);
          found = true;
          break;
        }
      }
      md = lines.join('\n');
      await writeTeamMemoryMd(md);
    }).then(resolve).catch(err => { writeError = err; resolve(); });
  });

  if (writeError) {
    return res.status(500).json({ success: false, error: '写入失败: ' + writeError.message });
  }

  if (!found) {
    return res.status(404).json({ success: false, error: '记忆不存在' });
  }

  res.json({ success: true });
});

// GET /api/memory/team — 获取团队共享记忆（从 Markdown 解析）
router.get('/team', async (req, res) => {
  const md = await readTeamMemoryMd();
  const categories = parseTeamMemoryMd(md);

  res.json({ success: true, categories, rawContent: md });
});

export default router;
