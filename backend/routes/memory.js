/**
 * 记忆系统 API
 *
 * 管理用户的 AI Agent 记忆文件和团队共享记忆（Markdown 格式）。
 * 通过 SSH 读写用户设备上的 workspace，搜索优先调用 OpenClaw memory_search，失败时降级为文件 grep。
 */

import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { sshExec } from '../utils/ssh.js';
import { config } from '../config/index.js';

const router = Router();

const MVP_MODE = config.mvpMode;
const SHARED_GATEWAY = {
  url: config.openclaw.url,
  token: config.openclaw.token,
  session: config.openclaw.session,
  openclawPort: config.userServer.openclawPort,
  openclawToken: config.openclaw.token,
  openclawSession: config.openclaw.session,
};

const ALLOWED_MEMORY_PATH_RE = /^(MEMORY\.md|memory\/[a-zA-Z0-9_\-\.]+\.md)$/;

const WORKSPACE_FIND_CMD = `
for d in /root/.openclaw/workspace /home/admin/.openclaw/workspace /home/node/.openclaw/workspace; do
  if [ -d "$d" ]; then echo "$d"; exit 0; fi
done
exit 1
`;

let writeLock = Promise.resolve();

router.use(verifyToken);

function sanitizeMemoryPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const cleaned = rawPath.replace(/^\.\/+|^\/+/, '');
  if (!ALLOWED_MEMORY_PATH_RE.test(cleaned)) return null;
  if (cleaned.includes('..')) return null;
  return cleaned;
}

async function resolveServer(req) {
  const db = await getDB();
  const serverId = req.query.serverId || req.body?.serverId;
  let userServer = null;

  if (serverId) {
    userServer = db.userServers?.find((s) => s.userId === req.user.id && s.id === serverId) || null;
  } else {
    userServer = getActiveServer(db, req.user.id);
  }

  if (userServer?.ip) return userServer;

  if (MVP_MODE) {
    return {
      ip: '127.0.0.1',
      openclawPort: SHARED_GATEWAY.openclawPort,
      openclawToken: SHARED_GATEWAY.openclawToken,
      openclawSession: SHARED_GATEWAY.openclawSession,
    };
  }

  return null;
}

async function getWorkspaceDir(ip) {
  const out = await sshExec(ip, WORKSPACE_FIND_CMD, { ignoreError: true, timeout: 15000 });
  const dir = (out || '').trim();
  return dir || null;
}

function teamMemoryPath(workspaceDir) {
  return `${workspaceDir}/shared/team-memory.md`;
}

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
  }
  if (currentCategory) categories.push(currentCategory);
  return categories;
}

async function readRemoteFile(ip, filePath) {
  const escaped = filePath.replace(/'/g, "'\\''");
  const out = await sshExec(ip, `cat '${escaped}' 2>/dev/null || true`, { ignoreError: true, timeout: 15000 });
  return out || '';
}

async function writeRemoteFile(ip, filePath, content) {
  const b64Content = Buffer.from(content).toString('base64');
  const escaped = filePath.replace(/'/g, "'\\''");
  await sshExec(
    ip,
    `mkdir -p "$(dirname '${escaped}')" && base64 -d <<< '${b64Content}' > '${escaped}'`,
    { timeout: 15000 },
  );
}

async function searchViaOpenClaw(userServer, query) {
  const session = userServer.openclawSession || '';
  const port = userServer.openclawPort || config.userServer.openclawPort;
  const base = session
    ? `http://${userServer.ip}:${port}/${session}/tools/invoke`
    : `http://${userServer.ip}:${port}/tools/invoke`;

  const response = await fetch(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userServer.openclawToken ? { Authorization: `Bearer ${userServer.openclawToken}` } : {}),
    },
    body: JSON.stringify({ tool: 'memory_search', args: { query } }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`openclaw_${response.status}`);
  }

  const data = await response.json();
  const raw = data.result?.results || data.results || data.payload?.results || data.payload || [];
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => ({
    text: item.text || item.content || item.line || String(item),
    content: item.content || item.text || item.line || String(item),
    path: item.path || item.file || item.source || '未知文件',
    score: typeof item.score === 'number' ? item.score : 1 - index * 0.01,
  }));
}

async function searchViaSsh(ip, workspaceDir, query) {
  const safeQuery = query.replace(/'/g, "'\\''");
  const cmd = `
WS='${workspaceDir}'
Q='${safeQuery}'
TARGETS=""
[ -f "$WS/MEMORY.md" ] && TARGETS="$WS/MEMORY.md"
[ -d "$WS/memory" ] && TARGETS="$TARGETS $WS/memory"
if [ -z "$TARGETS" ]; then exit 0; fi
grep -Hnri --include='*.md' -- "$Q" $TARGETS 2>/dev/null | head -40
`;

  const out = await sshExec(ip, cmd, { ignoreError: true, timeout: 20000 });
  const lines = (out || '').split('\n').filter(Boolean);
  const results = [];
  const prefix = `${workspaceDir}/`;

  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) continue;
    const [, fullPath, , text] = match;
    const path = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
    results.push({
      path,
      line: text.trim(),
      text: text.trim(),
      content: text.trim(),
      score: 0.8,
    });
  }

  return results;
}

router.get('/files', async (req, res) => {
  const userServer = await resolveServer(req);
  if (!userServer?.ip) {
    return res.status(400).json({ success: false, error: '未配置设备' });
  }

  try {
    const workspaceDir = await getWorkspaceDir(userServer.ip);
    if (!workspaceDir) {
      return res.json({ success: true, files: [] });
    }

    const cmd = `
WS='${workspaceDir}'
files=""
if [ -f "$WS/MEMORY.md" ]; then files="$files MEMORY.md"; fi
if [ -d "$WS/memory" ]; then
  for f in "$WS/memory"/*.md; do
    [ -f "$f" ] && files="$files memory/$(basename "$f")"
  done
fi
echo "$files"
`;

    const out = await sshExec(userServer.ip, cmd, { ignoreError: true, timeout: 15000 });
    const names = (out || '').trim().split(/\s+/).filter(Boolean);
    const files = names.map((name) => ({ name, path: name }));
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || '读取文件列表失败' });
  }
});

router.get('/content', async (req, res) => {
  const safePath = sanitizeMemoryPath(req.query.path);
  if (!safePath) {
    return res.status(400).json({ success: false, error: '无效的文件路径，仅允许 MEMORY.md 或 memory/*.md' });
  }

  const userServer = await resolveServer(req);
  if (!userServer?.ip) {
    return res.status(400).json({ success: false, error: '未配置设备' });
  }

  try {
    const workspaceDir = await getWorkspaceDir(userServer.ip);
    if (!workspaceDir) {
      return res.json({ success: true, content: '' });
    }

    const fullPath = `${workspaceDir}/${safePath}`;
    const content = await readRemoteFile(userServer.ip, fullPath);
    const MAX = 200 * 1024;

    if (content.length > MAX) {
      return res.json({
        success: true,
        content: content.substring(0, MAX),
        truncated: true,
        totalSize: content.length,
      });
    }

    res.json({ success: true, content });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || '读取文件失败' });
  }
});

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ success: false, error: '缺少搜索关键词' });
  }
  if (q.length > 200) {
    return res.status(400).json({ success: false, error: '搜索关键词过长' });
  }

  const userServer = await resolveServer(req);
  if (!userServer?.ip) {
    return res.status(400).json({ success: false, error: '未配置设备' });
  }

  try {
    let results = [];
    try {
      results = await searchViaOpenClaw(userServer, q);
    } catch (err) {
      console.warn('[memory/search] OpenClaw 搜索失败，降级 SSH:', err.message);
    }

    if (!results.length) {
      const workspaceDir = await getWorkspaceDir(userServer.ip);
      if (workspaceDir) {
        results = await searchViaSsh(userServer.ip, workspaceDir, q);
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ success: false, error: '搜索服务响应超时' });
    }
    res.status(502).json({ success: false, error: err.message || '搜索失败' });
  }
});

router.get('/team', async (req, res) => {
  const userServer = await resolveServer(req);
  if (!userServer?.ip) {
    return res.status(400).json({ success: false, error: '未配置设备' });
  }

  try {
    const workspaceDir = await getWorkspaceDir(userServer.ip);
    if (!workspaceDir) {
      return res.json({ success: true, categories: [], rawContent: '' });
    }

    const md = await readRemoteFile(userServer.ip, teamMemoryPath(workspaceDir));
    const categories = parseTeamMemoryMd(md);
    res.json({ success: true, categories, rawContent: md });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || '读取团队记忆失败' });
  }
});

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

  const userServer = await resolveServer(req);
  if (!userServer?.ip) {
    return res.status(400).json({ success: false, error: '未配置设备' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const line = `- ${trimmedContent}（${today}）`;
  let writeError = null;

  await new Promise((resolve) => {
    writeLock = writeLock.then(async () => {
      const workspaceDir = await getWorkspaceDir(userServer.ip);
      if (!workspaceDir) throw new Error('未找到 workspace 目录');
      const filePath = teamMemoryPath(workspaceDir);

      let md = await readRemoteFile(userServer.ip, filePath);
      const lines = md.split('\n');
      let categoryIndex = -1;
      let nextCategoryIndex = lines.length;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === `## ${category}`) {
          categoryIndex = i;
        } else if (categoryIndex !== -1 && lines[i].startsWith('## ') && !lines[i].startsWith('### ')) {
          nextCategoryIndex = i;
          break;
        }
      }

      if (categoryIndex !== -1) {
        let insertAt = nextCategoryIndex;
        for (let i = nextCategoryIndex - 1; i > categoryIndex; i--) {
          if (lines[i].trim() !== '') {
            insertAt = i + 1;
            break;
          }
        }
        if (insertAt <= categoryIndex + 1) insertAt = categoryIndex + 1;
        lines.splice(insertAt, 0, line);
        md = lines.join('\n');
      } else {
        if (md && !md.endsWith('\n')) md += '\n';
        md += `\n---\n\n## ${category}\n\n${line}\n`;
      }

      await writeRemoteFile(userServer.ip, filePath, md);
    }).then(resolve).catch((err) => {
      writeError = err;
      resolve();
    });
  });

  if (writeError) {
    return res.status(500).json({ success: false, error: `写入失败: ${writeError.message}` });
  }

  res.json({ success: true });
});

router.delete('/team', async (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ success: false, error: '缺少要删除的内容' });
  }

  const userServer = await resolveServer(req);
  if (!userServer?.ip) {
    return res.status(400).json({ success: false, error: '未配置设备' });
  }

  let found = false;
  let writeError = null;
  const target = `- ${content.trim()}`;

  await new Promise((resolve) => {
    writeLock = writeLock.then(async () => {
      const workspaceDir = await getWorkspaceDir(userServer.ip);
      if (!workspaceDir) return;

      const filePath = teamMemoryPath(workspaceDir);
      let md = await readRemoteFile(userServer.ip, filePath);
      if (!md) return;

      const lines = md.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('- ') && lines[i].trim() === target) {
          lines.splice(i, 1);
          found = true;
          break;
        }
      }
      await writeRemoteFile(userServer.ip, filePath, lines.join('\n'));
    }).then(resolve).catch((err) => {
      writeError = err;
      resolve();
    });
  });

  if (writeError) {
    return res.status(500).json({ success: false, error: `写入失败: ${writeError.message}` });
  }
  if (!found) {
    return res.status(404).json({ success: false, error: '记忆不存在' });
  }

  res.json({ success: true });
});

export default router;
