/**
 * 语音合成路由 - Noiz API
 */

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const router = express.Router();

// Noiz API Key（从环境变量或文件读取）
const NOIZ_API_KEY = process.env.NOIZ_API_KEY;

router.post('/generate', async (req, res) => {
  try {
    const { text, voice_id = 'b4775100' } = req.body;
    
    if (!text) {
      return res.status(400).json({ success: false, error: '缺少文本内容' });
    }
    
    console.log(`🔊 TTS 生成请求: ${text.substring(0, 50)}...`);
    
    // 生成唯一文件名
    const fileId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const fileName = `tts_${fileId}.mp3`;
    
    // 使用 backend 同级的 uploads 目录
    const uploadDir = path.join(process.cwd(), '..', 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, fileName);
    
    // 调用 Noiz TTS Python 脚本
    const scriptPath = '/tmp/skills/skills/tts/scripts/tts.py';
    const command = `python3 ${scriptPath} -t "${text.replace(/"/g, '\\"')}" --voice-id ${voice_id} --format mp3 -o ${filePath}`;
    
    console.log(`🔊 执行命令: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, NOIZ_API_KEY },
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    if (stderr && !stderr.includes('Done')) {
      console.error('🔊 TTS 生成错误:', stderr);
      return res.status(500).json({ success: false, error: 'TTS 生成失败' });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.error('🔊 TTS 文件未生成');
      return res.status(500).json({ success: false, error: 'TTS 文件未生成' });
    }
    
    const stats = fs.statSync(filePath);
    const publicUrl = `http://120.55.192.144:3000/uploads/${fileName}`;
    
    console.log(`🔊 TTS 生成成功: ${publicUrl} (${stats.size} bytes)`);
    
    return res.json({
      success: true,
      audio_url: publicUrl,
      file_path: filePath,
      size: stats.size
    });
    
  } catch (error) {
    console.error('🔊 TTS 生成错误:', error);
    return res.status(500).json({ success: false, error: 'TTS 生成失败: ' + error.message });
  }
});

export default router;
