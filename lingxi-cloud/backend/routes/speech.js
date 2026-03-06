/**
 * 语音识别路由 - 阿里云百炼
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  try {
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
    req.user = { id: decoded.userId };
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token 无效' });
  }
}

router.post('/recognize', authMiddleware, async (req, res) => {
  try {
    const { audio } = req.body;
    
    if (!audio) {
      return res.status(400).json({ success: false, error: '缺少音频数据' });
    }
    
    if (!DASHSCOPE_API_KEY) {
      return res.status(500).json({ success: false, error: '语音服务未配置' });
    }
    
    console.log(`🎤 [${req.user.id.substring(0, 8)}] 语音识别请求`);
    
    // 移除 data URL 前缀
    const audioBase64 = audio.replace(/^data:audio\/[^;]+;base64,/, '');
    
    // 保存文件到正确的 uploads 目录
    const fileId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const fileName = `speech_${fileId}.m4a`;
    
    // 使用 backend 同级的 uploads 目录
    const uploadDir = path.join(process.cwd(), '..', 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, fileName);
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    fs.writeFileSync(filePath, audioBuffer);
    
    console.log(`🎤 文件已保存: ${filePath}, 大小: ${audioBuffer.length} bytes`);
    
    // 公网 URL
    const audioUrl = `http://120.55.192.144:3000/uploads/${fileName}`;
    console.log(`🎤 音频 URL: ${audioUrl}`);
    
    // 调用百炼 API
    const asrResponse = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'paraformer-v2',
        input: {
          file_urls: [audioUrl],
        },
        parameters: {
          language_hints: ['zh', 'en'],
        },
      }),
    });
    
    const asrResult = await asrResponse.json();
    console.log(`🎤 ASR 响应:`, JSON.stringify(asrResult));
    
    if (asrResult.code) {
      try { fs.unlinkSync(filePath); } catch (e) {}
      return res.status(500).json({ success: false, error: asrResult.message });
    }
    
    const taskId = asrResult.output?.task_id;
    if (!taskId) {
      try { fs.unlinkSync(filePath); } catch (e) {}
      return res.status(500).json({ success: false, error: '创建任务失败' });
    }
    
    console.log(`🎤 任务 ID: ${taskId}`);
    
    // 轮询结果
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      
      const pollRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${DASHSCOPE_API_KEY}` },
      });
      
      const pollData = await pollRes.json();
      const status = pollData.output?.task_status;
      console.log(`🎤 轮询 ${i+1}: ${status}`);
      
      if (status === 'SUCCEEDED') {
        try { fs.unlinkSync(filePath); } catch (e) {}
        console.log(`🎤 完整响应:`, JSON.stringify(pollData));
        
        // 获取 transcription_url 的内容
        const transcriptionUrl = pollData.output?.results?.[0]?.transcription_url;
        let text = '';
        
        if (transcriptionUrl) {
          try {
            const transRes = await fetch(transcriptionUrl);
            const transData = await transRes.json();
            console.log(`🎤 转录数据:`, JSON.stringify(transData));
            text = transData.transcripts?.[0]?.text || '';
          } catch (e) {
            console.error('获取转录结果失败:', e);
          }
        } else {
          text = pollData.output?.results?.[0]?.transcription_text 
            || pollData.output?.transcription_text
            || pollData.output?.text
            || '';
        }
        
        console.log(`🎤 识别结果: ${text}`);
        return res.json({ success: true, data: { text } });
      } else if (status === 'FAILED') {
        try { fs.unlinkSync(filePath); } catch (e) {}
        console.log(`🎤 失败响应:`, JSON.stringify(pollData));
        return res.status(500).json({ success: false, error: '识别失败' });
      }
    }
    
    try { fs.unlinkSync(filePath); } catch (e) {}
    return res.status(500).json({ success: false, error: '识别超时' });
    
  } catch (error) {
    console.error('❌ 语音识别异常:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
