import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

const router = Router();

// 图片上传目录
const UPLOAD_DIR = '/home/admin/.openclaw/workspace/lingxi-cloud/uploads';

// 确保上传目录存在
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (e) {}
}

// 配置 multer 用于处理 multipart/form-data
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片'));
    }
  }
});

// 图片上传接口 - 支持两种方式
router.post('/image', upload.single('file'), async (req, res) => {
  try {
    await ensureUploadDir();
    
    // 方式1: multipart/form-data 上传（推荐）
    if (req.file) {
      const imageUrl = `http://120.55.192.144:3000/uploads/${req.file.filename}`;
      console.log(`📷 图片已上传(multipart): ${req.file.filename}, 大小: ${req.file.size} bytes`);
      
      return res.json({
        success: true,
        url: imageUrl,
        filename: req.file.filename
      });
    }
    
    // 方式2: base64 上传（兼容旧逻辑）
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: '图片数据为空' });
    }
    
    // 解析 data URL
    const match = image.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: '图片格式不正确' });
    }
    
    const mimeType = match[1];
    const base64Data = match[2];
    
    // 生成文件名
    const ext = mimeType.split('/')[1] || 'png';
    const filename = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    
    // 保存文件
    await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
    
    // 返回可访问的 URL
    const imageUrl = `http://120.55.192.144:3000/uploads/${filename}`;
    
    console.log(`📷 图片已上传(base64): ${filename}, 大小: ${base64Data.length} bytes`);
    
    res.json({
      success: true,
      url: imageUrl,
      filename
    });
    
  } catch (error) {
    console.error('图片上传失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
