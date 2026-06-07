import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import axios from 'axios';

const router = Router();
const FILE_API_PORT = 9092;

/** GET /api/file-explorer/list?path=/root */
router.get('/list', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ error: '没有可用的服务器' });

    const dirPath = req.query.path || '/root';
    const { data } = await axios.get(`http://${server.ip}:${FILE_API_PORT}/api/list`, {
      params: { path: dirPath },
      timeout: 8000,
    });
    res.json(data);
  } catch (e) {
    const msg = e.response?.data?.error || e.message;
    res.status(500).json({ error: msg });
  }
});

/** GET /api/file-explorer/get?path=/root/file.txt */
router.get('/get', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ error: '没有可用的服务器' });

    const filePath = req.query.path || '';
    if (!filePath) return res.status(400).json({ error: '缺少 path 参数' });

    const { data } = await axios.get(`http://${server.ip}:${FILE_API_PORT}/api/get`, {
      params: { path: filePath },
      timeout: 10000,
    });
    res.json(data);
  } catch (e) {
    const msg = e.response?.data?.error || e.message;
    res.status(500).json({ error: msg });
  }
});

/** GET /api/file-explorer/search?q=keyword&path=/root — 文件搜索 */
router.get('/search', verifyToken, async (req, res) => {
  try {
    var keyword = (req.query.q || '').trim();
    var searchPath = req.query.path || '/root';

    if (!keyword) {
      return res.status(400).json({ success: false, error: '请输入搜索关键词' });
    }
    if (keyword.length > 200) {
      return res.status(400).json({ success: false, error: '搜索关键词过长' });
    }

    var db = await getDB();
    var server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ success: false, error: '没有可用的服务器' });

    var results = [];
    var keywordLower = keyword.toLowerCase();

    // 递归搜索（限制深度 3 层）
    async function searchDir(dirPath, depth) {
      if (depth > 3) return;
      if (results.length >= 100) return; // 限制结果数量

      try {
        var { data } = await axios.get(`http://${server.ip}:${FILE_API_PORT}/api/list`, {
          params: { path: dirPath },
          timeout: 8000,
        });

        var files = data.files || data.items || data || [];
        if (!Array.isArray(files)) return;

        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          var name = f.name || f.path || '';
          if (name.toLowerCase().includes(keywordLower)) {
            results.push({
              name: name,
              path: dirPath === '/' ? '/' + name : dirPath + '/' + name,
              size: f.size || 0,
              type: f.type || (f.isDirectory ? 'directory' : 'file'),
              modified: f.modified || f.mtime || null,
            });
          }

          // 如果是目录，递归搜索
          if ((f.isDirectory || f.type === 'directory') && depth < 3) {
            var subPath = dirPath === '/' ? '/' + name : dirPath + '/' + name;
            await searchDir(subPath, depth + 1);
          }
        }
      } catch (e) {
        // 某些目录可能无权限，跳过
        console.warn('[文件搜索] 无法访问目录:', dirPath, e.message);
      }
    }

    await searchDir(searchPath, 0);

    res.json({ success: true, files: results });
  } catch (e) {
    var msg = e.response?.data?.error || e.message;
    res.status(500).json({ success: false, error: msg });
  }
});

/** GET /api/file-explorer/download?path=xxx — 文件下载代理 */
router.get('/download', verifyToken, async (req, res) => {
  try {
    var filePath = req.query.path || '';
    if (!filePath) {
      return res.status(400).json({ success: false, error: '缺少 path 参数' });
    }

    // 安全检查：防止路径穿越
    if (filePath.includes('..')) {
      return res.status(400).json({ success: false, error: '非法路径' });
    }

    var db = await getDB();
    var server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ success: false, error: '没有可用的服务器' });

    // 从 file-api 获取文件内容
    var response = await axios.get(`http://${server.ip}:${FILE_API_PORT}/api/get`, {
      params: { path: filePath },
      timeout: 30000,
      responseType: 'arraybuffer',
    });

    // 提取文件名
    var fileName = filePath.split('/').pop() || 'download';

    // 设置下载头
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(fileName) + '"');
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    res.send(response.data);
  } catch (e) {
    var msg = e.response?.data?.error || e.message;
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
