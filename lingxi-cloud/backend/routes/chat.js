import { Router } from 'express';
import { getUser, getDB } from '../utils/db.js';
import { recordUsage } from '../utils/user_utils.js';

const PROXY_LITE_URL = process.env.PROXY_LITE_URL || 'http://127.0.0.1:13000';

/** 统一流式代理 → ai-proxy-lite */
async function streamChat(message, userId, systemPrompt, model, res) {
  const body = {
    model: model || 'auto',
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: message },
    ],
    stream: true,
    'extra-body': { userId },
  };
  const resp = await fetch(`${PROXY_LITE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ai-proxy-lite ${resp.status}: ${text.substring(0, 200)}`);
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(decoder.decode(value));
  }
  res.end();
}

const router = Router();

// 🎭 角色 system prompt 配置
const ROLE_PROMPTS = {
  lingxi: '你是灵犀，机灵俏皮的天才调度员。你是团队队长，负责调度和沟通。说话活泼但不轻浮，有点小调皮但关键时刻靠谱。喜欢用 😄 🚀 ✨ 这类表情。',
  coder: '你是云溪，代码专家。擅长各种编程语言、架构设计、bug 修复。回答技术问题时简洁精准，直接给代码和方案。',
  ops: '你是若曦，数据运营专家。擅长数据分析、用户增长、SEO、报表。看到数据就两眼放光，善于从数据中发现问题和机会。',
  inventor: '你是紫萱，创意天才。擅长文案、创意、营销策划、品牌建设。脑洞大开，总能想出有趣的点子。',
  pm: '你是梓萱，产品经理。擅长需求分析、产品设计、MVP 规划、用户体验。善于从用户角度思考问题。',
  noter: '你是晓琳，知识管理专家。擅长学习、翻译、笔记、搜索、文档整理。回答条理清晰，善于总结归纳。',
  media: '你是音韵，多媒体专家。擅长图片、视频、音乐、设计。对视觉美感有很高的要求。',
  smart: '你是智家，自动化专家。擅长脚本编写、工具开发、效率提升、批量处理。追求自动化一切。',
};

// 默认角色名（前端传 role 参数）
const ROLE_MAP = {
  lingxi: 'lingxi',
  '灵犀': 'lingxi',
  coder: 'coder',
  '云溪': 'coder',
  ops: 'ops',
  '若曦': 'ops',
  inventor: 'inventor',
  '紫萱': 'inventor',
  pm: 'pm',
  '梓萱': 'pm',
  noter: 'noter',
  '晓琳': 'noter',
  media: 'media',
  '音韵': 'media',
  smart: 'smart',
  '智家': 'smart',
};

/**
 * 聊天 API（流式）
 * 所有用户统一走 ai-proxy-lite
 */
router.post('/simple', async (req, res) => {
  try {
    const { userId, message, imageUrl, role } = req.body;

    if (!message && !imageUrl) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const user = await getUser(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const roleKey = ROLE_MAP[role] || 'lingxi';
    const systemPrompt = ROLE_PROMPTS[roleKey] || ROLE_PROMPTS.lingxi;

    // 构建消息内容
    let content = message;
    if (imageUrl) {
      content = [
        { type: 'text', text: message || '请描述这张图片' },
        { type: 'image_url', image_url: { url: imageUrl } },
      ];
    }

    await recordUsage(userId);
    await streamChat(content, userId, systemPrompt, 'auto', res);
  } catch (error) {
    console.error('免费用户对话错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取可用角色列表（前端用）
 */
router.get('/roles', (req, res) => {
  const roles = [
    { id: 'lingxi', name: '灵犀', emoji: '⚡', desc: '队长 · 调度' },
    { id: 'coder', name: '云溪', emoji: '💻', desc: '代码专家' },
    { id: 'ops', name: '若曦', emoji: '📊', desc: '运营专家' },
    { id: 'inventor', name: '紫萱', emoji: '💡', desc: '创意天才' },
    { id: 'pm', name: '梓萱', emoji: '🎯', desc: '产品经理' },
    { id: 'noter', name: '晓琳', emoji: '📝', desc: '知识管理' },
    { id: 'media', name: '音韵', emoji: '🎧', desc: '多媒体' },
    { id: 'smart', name: '智家', emoji: '🏠', desc: '自动化' },
  ];
  res.json({ roles });
});

// HTTP 发送（所有用户统一走 ai-proxy-lite 流式）
router.post('/send', async (req, res) => {
  try {
    const { message, userId, role, model } = req.body;
    if (!message) return res.status(400).json({ error: '消息不能为空' });

    const roleKey = ROLE_MAP[role] || 'lingxi';
    const systemPrompt = ROLE_PROMPTS[roleKey] || ROLE_PROMPTS.lingxi;
    await streamChat(message, userId, systemPrompt, model, res);
  } catch (e) {
    console.error('[chat/send] 错误:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      res.end();
    }
  }
});

export default router;
