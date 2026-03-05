/**
 * 语音识别路由 - 使用阿里云 DashScope Paraformer
 * 
 * 支持一句话识别：上传音频 → 返回文字
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// Token 验证中间件
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

/**
 * 语音识别接口
 * POST /api/speech/recognize
 * Body: { audio: "base64编码的音频", format: "pcm/wav/mp3" }
 * 
 * 支持格式：
 * - PCM: 16K 采样率，16bit，单声道
 * - WAV: 16K 采样率，16bit，单声道
 * - MP3: 任意采样率
 */
router.post('/recognize', authMiddleware, async (req, res) => {
  try {
    const { audio, format = 'pcm' } = req.body;
    
    if (!audio) {
      return res.status(400).json({ success: false, error: '缺少音频数据' });
    }
    
    if (!DASHSCOPE_API_KEY) {
      console.error('❌ DASHSCOPE_API_KEY 未配置');
      return res.status(500).json({ success: false, error: '语音服务未配置' });
    }
    
    console.log(`🎤 [${req.user.id.substring(0, 8)}] 语音识别请求, format: ${format}, audio length: ${audio.length}`);
    
    // 调用阿里云 DashScope Paraformer 语音识别
    // 文档: https://help.aliyun.com/document_detail/2712536.html
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/paraformer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'paraformer-realtime-v2',  // 实时语音识别模型
        input: {
          audio: audio,  // base64 编码的音频
          format: format,  // 音频格式: pcm, wav, mp3, opus, speex, speex-wb
          sample_rate: 16000,  // 采样率（PCM/WAV 需要）
        },
        parameters: {
          language_hints: ['zh', 'en'],  // 支持中英文混合
        },
      }),
    });
    
    const result = await response.json();
    console.log(`🎤 [${req.user.id.substring(0, 8)}] 识别结果:`, JSON.stringify(result).substring(0, 200));
    
    if (result.code) {
      // 错误响应
      console.error('❌ 语音识别失败:', result);
      return res.status(500).json({ 
        success: false, 
        error: result.message || '语音识别失败',
        code: result.code 
      });
    }
    
    // 成功响应格式: { output: { sentence: { text: "识别结果" } } }
    const text = result.output?.sentence?.text || '';
    
    res.json({
      success: true,
      data: {
        text: text,
        raw: result,
      },
    });
    
  } catch (error) {
    console.error('❌ 语音识别异常:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 语音识别 - 简化版（兼容不同音频格式）
 * POST /api/speech/recognize-simple
 * Body: { audio: "base64编码的音频" }
 */
router.post('/recognize-simple', authMiddleware, async (req, res) => {
  try {
    const { audio } = req.body;
    
    if (!audio) {
      return res.status(400).json({ success: false, error: '缺少音频数据' });
    }
    
    if (!DASHSCOPE_API_KEY) {
      return res.status(500).json({ success: false, error: '语音服务未配置' });
    }
    
    // 移除可能的 data URL 前缀
    const audioBase64 = audio.replace(/^data:audio\/[^;]+;base64,/, '');
    
    console.log(`🎤 [${req.user.id.substring(0, 8)}] 简化语音识别, audio length: ${audioBase64.length}`);
    
    // 尝试使用文件识别（支持更多格式）
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/file', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'paraformer-v2',
        input: {
          audio: audioBase64,
        },
        parameters: {
          language_hints: ['zh', 'en'],
        },
      }),
    });
    
    const result = await response.json();
    console.log(`🎤 识别结果:`, JSON.stringify(result).substring(0, 200));
    
    if (result.code) {
      // 如果 file API 失败，尝试 realtime API
      console.log('⚠️ file API 失败，尝试 realtime API...');
      
      const response2 = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/paraformer', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'paraformer-realtime-v2',
          input: {
            audio: audioBase64,
            format: 'wav',
            sample_rate: 16000,
          },
          parameters: {
            language_hints: ['zh', 'en'],
          },
        }),
      });
      
      const result2 = await response2.json();
      
      if (result2.code) {
        console.error('❌ 语音识别失败:', result2);
        return res.status(500).json({ 
          success: false, 
          error: result2.message || '语音识别失败' 
        });
      }
      
      const text = result2.output?.sentence?.text || '';
      return res.json({ success: true, data: { text } });
    }
    
    // file API 成功
    const text = result.output?.results?.[0]?.transcription_text || '';
    res.json({ success: true, data: { text } });
    
  } catch (error) {
    console.error('❌ 语音识别异常:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
