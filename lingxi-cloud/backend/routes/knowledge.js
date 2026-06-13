/**
 * 知识库管理 API
 *
 * 管理用户上传的知识文档（PDF、Word、TXT、Markdown、CSV）。
 * 文件存储到 backend/data/knowledge/{userId}/，元数据存到 db.knowledge。
 *
 * 路由：
 *  GET  /list          — 获取知识库文件列表
 *  POST /upload         — 上传知识文档（multer，20MB）
 *  GET  /search         — 搜索知识库（关键词匹配）
 *  GET  /content/:id    — 获取文档文本内容
 *  POST /delete         — 删除知识文档
 */

import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDB, saveDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { callOpenClawRPC } from '../utils/openclaw-rpc.js';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// 所有路由都需要登录
router.use(verifyToken);

// 知识库文件存储根目录
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'data', 'knowledge');

// 支持的文件类型
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.csv'];
const ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/csv',
  // 有些浏览器上传 .md 时可能用这些 mime
  'application/octet-stream',
];

// multer 配置
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    var dir = path.join(KNOWLEDGE_DIR, req.user.id);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    var ext = path.extname(file.originalname) || '';
    var name = crypto.randomBytes(12).toString('hex') + ext;
    cb(null, name);
  }
});

var upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    var ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型: ' + ext + '，仅支持 PDF/Word/TXT/Markdown/CSV'));
    }
  }
});

// ============ Helpers ============

/**
 * 获取文件类型标识
 */
function getFileType(filename) {
  var ext = path.extname(filename).toLowerCase();
  var map = {
    '.pdf': 'pdf',
    '.docx': 'word',
    '.doc': 'word',
    '.txt': 'txt',
    '.md': 'markdown',
    '.csv': 'csv',
  };
  return map[ext] || 'unknown';
}

/**
 * 从文件提取文本内容
 */
async function extractText(filePath, type) {
  try {
    if (type === 'txt' || type === 'markdown') {
      var content = await fs.readFile(filePath, 'utf-8');
      return content;
    }

    if (type === 'csv') {
      var content = await fs.readFile(filePath, 'utf-8');
      var lines = content.split('\n').slice(0, 100);
      return lines.join('\n');
    }

    if (type === 'pdf') {
      // 尝试加载 pdf-parse（可能未安装）
      try {
        var pdfParse = (await import('pdf-parse')).default || (await import('pdf-parse'));
        if (typeof pdfParse === 'function') {
          var buf = await fs.readFile(filePath);
          var data = await pdfParse(buf);
          return data.text || '';
        } else if (pdfParse && typeof pdfParse.default === 'function') {
          var buf = await fs.readFile(filePath);
          var data = await pdfParse.default(buf);
          return data.text || '';
        }
      } catch (e) {
        console.warn('[知识库] pdf-parse 未安装或解析失败，跳过 PDF 文本提取:', e.message);
      }
      return '[PDF 文件，文本提取暂不可用]';
    }

    if (type === 'word') {
      return '[Word 文档，需要后续处理]';
    }

    return '';
  } catch (e) {
    console.error('[知识库] 文本提取失败:', e.message);
    return '';
  }
}

/**
 * 生成摘要（前 200 字）
 */
function generateSummary(text) {
  if (!text) return '';
  var clean = text.replace(/\s+/g, ' ').trim();
  return clean.substring(0, 200);
}

/**
 * 确保数据库中有 knowledge 数组
 */
function ensureKnowledgeArray(db) {
  if (!db.knowledge) {
    db.knowledge = [];
  }
}

// ============ Routes ============

/**
 * GET /list — 获取知识库文件列表
 */
router.get('/list', async (req, res) => {
  try {
    var db = await getDB();
    ensureKnowledgeArray(db);

    var items = db.knowledge.filter(function(item) {
      return item.userId === req.user.id;
    });

    // 按上传时间倒序
    items.sort(function(a, b) {
      return new Date(b.uploadedAt) - new Date(a.uploadedAt);
    });

    // 返回时去掉 textContent（太大了），通过 /content/:id 单独获取
    var result = items.map(function(item) {
      return {
        id: item.id,
        filename: item.originalName,
        type: item.type,
        size: item.size,
        summary: item.summary,
        tags: item.tags || [],
        uploadedAt: item.uploadedAt,
      };
    });

    res.json({ success: true, items: result });
  } catch (e) {
    console.error('[知识库] 获取列表失败:', e);
    res.status(500).json({ success: false, error: '获取列表失败: ' + e.message });
  }
});

/**
 * POST /upload — 上传知识文档
 */
router.post('/upload', function(req, res, next) {
  upload.fields([{ name: 'files', maxCount: 10 }, { name: 'file', maxCount: 1 }])(req, res, function(err) {
    if (err) {
      var msg = err.message || '上传失败';
      if (err.code === 'LIMIT_FILE_SIZE') msg = '文件大小超过 20MB 限制';
      if (err.code === 'LIMIT_FILE_COUNT') msg = '一次最多上传 10 个文件';
      return res.status(400).json({ success: false, error: msg });
    }
    next();
  });
}, async (req, res) => {
  try {
    var files = req.files?.files || req.files?.file || req.files || [];
    if (!Array.isArray(files)) files = files ? [files] : [];
    if (files.length === 0 && req.file) files = [req.file];
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: '请选择文件' });
    }

    var db = await getDB();
    ensureKnowledgeArray(db);

    var uploadedItems = [];

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var type = getFileType(file.originalname);

      // 提取文本
      var textContent = await extractText(file.path, type);

      // 生成摘要
      var summary = generateSummary(textContent);

      var item = {
        id: 'kn_' + crypto.randomBytes(8).toString('hex'),
        userId: req.user.id,
        filename: file.filename,
        originalName: file.originalname,
        type: type,
        size: file.size,
        filePath: path.join(req.user.id, file.filename),
        textContent: textContent,
        summary: summary,
        tags: [],
        uploadedAt: new Date().toISOString(),
      };

      db.knowledge.push(item);
      uploadedItems.push({
        id: item.id,
        filename: item.originalName,
        type: item.type,
        size: item.size,
        summary: item.summary,
        tags: item.tags,
        uploadedAt: item.uploadedAt,
      });
    }

    await saveDB(db);

    console.log('[知识库] 用户', req.user.id, '上传了', uploadedItems.length, '个文件');

    // 同步到 OpenClaw memory
    for (var ui = 0; ui < uploadedItems.length; ui++) {
      try {
        var upItem = uploadedItems[ui];
        var dbItem = db.knowledge.find(k => k.id === upItem.id);
        if (!dbItem || !dbItem.textContent) continue;
        var userServer = getActiveServer(db, req.user.id) || db.userServers?.find(s => s.userId === req.user.id && s.ip);
        if (userServer) {
          var mdContent = '# ' + dbItem.originalName + '\n\n> 类型: ' + dbItem.type + ' | 大小: ' + (dbItem.size / 1024).toFixed(1) + 'KB | 上传时间: ' + dbItem.uploadedAt + '\n\n' + dbItem.textContent;
          await callOpenClawRPC(userServer, 'chat.send', {
            sessionKey: 'openclaw-control-ui',
            message: '请用 write 工具将以下内容写入文件 memory/knowledge-' + dbItem.id + '.md（直接写入，不要回复）：\n\n' + mdContent,
          }, { timeout: 30000 });
        }
      } catch (e) {
        console.warn('[知识库] 同步到 memory 失败:', e.message);
      }
    }

    res.json({ success: true, items: uploadedItems });
  } catch (e) {
    console.error('[知识库] 上传失败:', e);
    if (e.message && e.message.indexOf('不支持的文件类型') !== -1) {
      return res.status(400).json({ success: false, error: e.message });
    }
    res.status(500).json({ success: false, error: '上传失败: ' + e.message });
  }
});

/**
 * GET /search — 搜索知识库
 */
router.get('/search', async (req, res) => {
  try {
    var q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ success: false, error: '请输入搜索关键词' });
    }
    if (q.length > 200) {
      return res.status(400).json({ success: false, error: '搜索关键词过长' });
    }

    var db = await getDB();
    ensureKnowledgeArray(db);

    var userItems = db.knowledge.filter(function(item) {
      return item.userId === req.user.id;
    });

    var qLower = q.toLowerCase();
    var results = [];

    for (var i = 0; i < userItems.length; i++) {
      var item = userItems[i];
      var matched = false;
      var snippet = '';
      var score = 0;

      // 搜索文件名
      if (item.originalName && item.originalName.toLowerCase().includes(qLower)) {
        matched = true;
        score += 10;
      }

      // 搜索文本内容
      if (item.textContent) {
        var textLower = item.textContent.toLowerCase();
        var idx = textLower.indexOf(qLower);
        if (idx !== -1) {
          matched = true;
          score += 5;
          // 取关键词前后各 100 字作为片段
          var start = Math.max(0, idx - 100);
          var end = Math.min(item.textContent.length, idx + q.length + 100);
          snippet = (start > 0 ? '...' : '') + item.textContent.substring(start, end) + (end < item.textContent.length ? '...' : '');
        }
      }

      if (matched) {
        results.push({
          id: item.id,
          filename: item.originalName,
          snippet: snippet,
          score: score,
        });
      }
    }

    // 按相关度排序
    results.sort(function(a, b) { return b.score - a.score; });

    res.json({ success: true, results: results });
  } catch (e) {
    console.error('[知识库] 搜索失败:', e);
    res.status(500).json({ success: false, error: '搜索失败: ' + e.message });
  }
});

/**
 * GET /content/:id — 获取文档文本内容
 */
router.get('/content/:id', async (req, res) => {
  try {
    var db = await getDB();
    ensureKnowledgeArray(db);

    var item = db.knowledge.find(function(item) {
      return item.id === req.params.id && item.userId === req.user.id;
    });

    if (!item) {
      return res.status(404).json({ success: false, error: '文档不存在' });
    }

    res.json({
      success: true,
      content: item.textContent || '',
      filename: item.originalName,
      type: item.type,
    });
  } catch (e) {
    console.error('[知识库] 获取内容失败:', e);
    res.status(500).json({ success: false, error: '获取内容失败: ' + e.message });
  }
});

/**
 * POST /delete — 删除知识文档
 */
router.post('/delete', async (req, res) => {
  try {
    var id = req.body.id;
    if (!id) {
      return res.status(400).json({ success: false, error: '缺少文档 ID' });
    }

    var db = await getDB();
    ensureKnowledgeArray(db);

    var index = -1;
    for (var i = 0; i < db.knowledge.length; i++) {
      if (db.knowledge[i].id === id && db.knowledge[i].userId === req.user.id) {
        index = i;
        break;
      }
    }

    if (index === -1) {
      return res.status(404).json({ success: false, error: '文档不存在' });
    }

    var item = db.knowledge[index];

    // 删除文件
    try {
      var filePath = path.join(KNOWLEDGE_DIR, item.filePath);
      await fs.unlink(filePath);
    } catch (e) {
      console.warn('[知识库] 文件删除失败（可能已不存在）:', e.message);
    }

    // 从数据库移除
    db.knowledge.splice(index, 1);
    await saveDB(db);

    console.log('[知识库] 用户', req.user.id, '删除了文档:', item.originalName);

    // 同步清理 OpenClaw memory 文件
    try {
      var userServer = getActiveServer(db, req.user.id) || db.userServers?.find(s => s.userId === req.user.id && s.ip);
      if (userServer) {
        await callOpenClawRPC(userServer, 'chat.send', {
          sessionKey: 'openclaw-control-ui',
          message: '请用 exec 工具执行: rm -f memory/knowledge-' + item.id + '.md',
        }, { timeout: 15000 });
      }
    } catch (e) {
      console.warn('[知识库] 清理 memory 文件失败:', e.message);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[知识库] 删除失败:', e);
    res.status(500).json({ success: false, error: '删除失败: ' + e.message });
  }
});

export default router;
