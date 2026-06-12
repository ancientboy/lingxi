/**
 * Agent 市场 API 路由
 *
 * 提供市场 Agent 的列表、详情、发布、安装、评价等功能
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { verifyToken } from '../middleware/auth.js';
import { getDB, saveDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { callOpenClawRPC } from '../utils/openclaw-rpc.js';
import { rebuildAndPushForUser } from '../utils/dispatch-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { randomUUID } = crypto;

const router = express.Router();

// 所有路由都需要鉴权
router.use(verifyToken);

// ============ 工具函数 ============

function getMarketPresetsPath() {
  return path.resolve(__dirname, '..', 'templates', 'agent-market.json');
}

function readOfficialPresets() {
  try {
    const raw = fs.readFileSync(getMarketPresetsPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pinyinSlug(name) {
  // 简单中英混合 slug 生成
  return name
    .toLowerCase()
    .replace(/[\s]+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '')
    .slice(0, 30) || 'agent';
}

function getItemReviews(db, itemId) {
  return (db.marketReviews || []).filter(r => r.itemId === itemId);
}

function applyReviewStats(item, reviews) {
  if (!reviews.length) {
    item.rating = item.rating || 0;
    item.reviewCount = item.reviewCount || 0;
    item.reviews = [];
    return item;
  }
  const totalScore = reviews.reduce((sum, r) => sum + (r.score || 0), 0);
  item.reviewCount = reviews.length;
  item.rating = Math.round((totalScore / reviews.length) * 10) / 10;
  item.reviews = reviews.map(r => ({
    userId: r.userId,
    score: r.score,
    review: r.review,
    rating: r.score,
    content: r.review,
    createdAt: r.createdAt,
  }));
  return item;
}

function updateOfficialPresetRating(itemId, rating, reviewCount) {
  try {
    const presets = readOfficialPresets();
    const preset = presets.find(o => o.id === itemId);
    if (!preset) return;
    preset.rating = rating;
    preset.reviewCount = reviewCount;
    fs.writeFileSync(getMarketPresetsPath(), JSON.stringify(presets, null, 2));
  } catch (err) {
    console.warn('更新官方 Agent 评分失败:', err.message);
  }
}

// ============ API 路由 ============

/**
 * GET /list — 市场列表
 * ?category=dev|content|ops|personal&sort=popular|newest&search=keyword
 */
router.get('/list', async (req, res) => {
  try {
    const { category, sort = 'popular', search } = req.query;
    const db = await getDB();

    // 合并官方预设 + 用户发布
    const official = readOfficialPresets();
    const userItems = (db.marketItems || []).map(item => ({ ...item, isOfficial: false }));
    let allItems = [...official, ...userItems];

    // 分类过滤
    if (category && category !== 'all') {
      allItems = allItems.filter(item => item.category === category);
    }

    // 搜索
    if (search && typeof search === 'string') {
      const keyword = search.slice(0, 200).toLowerCase();
      allItems = allItems.filter(item => {
        const name = (item.name || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const tags = (item.tags || []).join(' ').toLowerCase();
        return name.includes(keyword) || desc.includes(keyword) || tags.includes(keyword);
      });
    }

    // 排序
    if (sort === 'popular') {
      allItems.sort((a, b) => (b.installCount || 0) - (a.installCount || 0));
    } else if (sort === 'newest') {
      allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // 标记已安装
    const userId = req.user.id;
    const installs = (db.marketInstalls || []).filter(r => r.userId === userId);
    const installedIds = new Set(installs.map(r => r.itemId));
    allItems = allItems.map(item => {
      const reviews = getItemReviews(db, item.id);
      const merged = applyReviewStats({ ...item }, reviews.length ? reviews : (item.reviews || []));
      return {
        ...merged,
        installed: installedIds.has(item.id),
      };
    });

    res.json({ success: true, items: allItems });
  } catch (err) {
    console.error('获取市场列表失败:', err);
    res.status(500).json({ success: false, error: '获取市场列表失败' });
  }
});

/**
 * GET /detail/:id — Agent 详情
 */
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    // 先查官方
    const official = readOfficialPresets();
    let item = official.find(o => o.id === id);

    // 再查用户发布
    if (!item) {
      const userItems = db.marketItems || [];
      item = userItems.find(o => o.id === id);
    }

    if (!item) {
      return res.status(404).json({ success: false, error: 'Agent 不存在' });
    }

    const reviews = getItemReviews(db, item.id);
    const merged = applyReviewStats({ ...item }, reviews.length ? reviews : (item.reviews || []));

    res.json({ success: true, item: merged });
  } catch (err) {
    console.error('获取 Agent 详情失败:', err);
    res.status(500).json({ success: false, error: '获取详情失败' });
  }
});

/**
 * POST /publish — 发布 Agent
 */
router.post('/publish', async (req, res) => {
  try {
    const { name, description, soulMd, skills, model, tags, avatar, category } = req.body;
    const userId = req.user.id;

    // 校验必填字段
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Agent 名称不能为空' });
    }
    if (name.length > 50) {
      return res.status(400).json({ success: false, error: 'Agent 名称不能超过50字' });
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Agent 描述不能为空' });
    }
    if (description.length > 500) {
      return res.status(400).json({ success: false, error: '描述不能超过500字' });
    }
    if (!soulMd || typeof soulMd !== 'string' || soulMd.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'SOUL.md 内容不能为空' });
    }
    if (soulMd.length > 5000) {
      return res.status(400).json({ success: false, error: 'SOUL.md 内容不能超过5000字' });
    }

    const db = await getDB();
    if (!db.marketItems) db.marketItems = [];

    // 检查同名
    const duplicate = db.marketItems.find(
      item => item.userId === userId && item.name === name.trim()
    );
    if (duplicate) {
      return res.status(400).json({ success: false, error: '你已经发布过同名 Agent' });
    }

    // 创建市场项
    const newItem = {
      id: 'agent_' + randomUUID(),
      userId,
      name: name.trim(),
      description: description.trim(),
      soulMd: soulMd.trim(),
      skills: Array.isArray(skills) ? skills.slice(0, 20) : [],
      model: model || 'glm-5.1',
      tags: Array.isArray(tags) ? tags.slice(0, 10).map(t => String(t).slice(0, 20)) : [],
      avatar: avatar || 'bot',
      category: category || 'personal',
      installCount: 0,
      rating: 0,
      reviewCount: 0,
      isOfficial: false,
      reviews: [],
      createdAt: new Date().toISOString(),
    };

    db.marketItems.push(newItem);
    await saveDB(db);

    res.json({ success: true, item: newItem });
  } catch (err) {
    console.error('发布 Agent 失败:', err);
    res.status(500).json({ success: false, error: '发布失败' });
  }
});

/**
 * POST /install/:id — 安装 Agent 到团队
 */
router.post('/install/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const db = await getDB();

    // 查找市场项
    const official = readOfficialPresets();
    let item = official.find(o => o.id === id);
    if (!item) {
      const userItems = db.marketItems || [];
      item = userItems.find(o => o.id === id);
    }

    if (!item) {
      return res.status(404).json({ success: false, error: 'Agent 不存在' });
    }

    // 获取用户活跃服务器
    let userServer = null;
    // 优先使用前端传来的 serverId
    const { serverId } = req.body;
    if (serverId) {
      userServer = db.userServers?.find(s => s.userId === userId && s.id === serverId);
    }
    // 兜底：getActiveServer
    if (!userServer || !userServer.ip) {
      userServer = getActiveServer(db, userId);
    }
    // 再兜底：任意一台有 IP 的服务器
    if (!userServer || !userServer.ip) {
      userServer = db.userServers?.find(s => s.userId === userId && s.ip);
    }
    if (!userServer || !userServer.ip || !userServer.openclawPort) {
      return res.status(400).json({ success: false, error: '请先在设置中绑定你的 OpenClaw 设备' });
    }

    // 生成 agent ID
    const agentId = pinyinSlug(item.name) + '_' + Date.now().toString(36);
    const deployId = randomUUID().substring(0, 8);
    const sessionKey = `agent:main:market-install-${deployId}`;

    // 1. 读取当前配置
    const configRes = await callOpenClawRPC(userServer, 'config.get', {}, {
      displayName: 'Agent 市场安装',
    });
    if (!configRes.ok) {
      return res.status(502).json({ success: false, error: '读取 OpenClaw 配置失败' });
    }

    const baseHash = configRes.payload?.hash;
    const currentConfig = configRes.payload?.config || {};
    const agentsList = currentConfig.agents?.list || [];
    const defaultWorkspace = currentConfig.agents?.defaults?.workspace || '~/.openclaw/workspace';
    const workspace = `${defaultWorkspace}-${agentId}`;

    // 2. 构建新 agent
    const newAgent = {
      id: agentId,
      workspace,
      identity: {
        name: item.name,
        emoji: '🤖',
      },
      model: item.model || 'glm-5.1',
    };

    // 添加到列表
    const updatedList = [...agentsList, newAgent];

    // 3. config.patch 写入
    const patchRes = await callOpenClawRPC(userServer, 'config.patch', {
      raw: JSON.stringify({ agents: { list: updatedList } }),
      baseHash,
      note: `Agent 市场安装: ${item.name}`,
    }, { timeout: 15000 });

    if (!patchRes.ok) {
      return res.status(502).json({ success: false, error: '配置更新失败: ' + JSON.stringify(patchRes.error) });
    }

    // 等待重启
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. 写 SOUL.md
    if (item.soulMd) {
      try {
        await callOpenClawRPC(userServer, 'chat.send', {
          sessionKey,
          message: `请用 write 工具将以下内容写入 agent:${agentId} 的工作区文件 SOUL.md，直接写入不要回复多余内容：\n\n${item.soulMd}`,
        }, { timeout: 30000 });
      } catch (err) {
        console.warn(`写入 SOUL.md 失败:`, err.message);
      }
    }

    // 5. 安装 Skills（如果有）
    const skillsToInstall = item.skills || [];
    if (skillsToInstall.length > 0) {
      for (let si = 0; si < skillsToInstall.length; si++) {
        const skillId = skillsToInstall[si];
        try {
          await callOpenClawRPC(userServer, 'chat.send', {
            sessionKey,
            message: `请使用 clawhub skill 安装技能 "${skillId}"，为新安装的 agent ${agentId} 安装。执行安装即可，不需要回复多余内容。`,
          }, { timeout: 60000 });
        } catch (err) {
          console.warn(`⚠️ Skill ${skillId} 安装失败:`, err.message);
        }
      }
    }

    // 6. 更新安装计数（防重复）
    if (!db.marketInstalls) db.marketInstalls = [];
    const alreadyInstalled = db.marketInstalls.find(r => r.userId === userId && r.itemId === id);
    if (!alreadyInstalled) {
      db.marketInstalls.push({ userId, itemId: id, agentId, installedAt: new Date().toISOString() });

      if (item.isOfficial) {
        // 官方 Agent 计数写回预设文件
        const presets = readOfficialPresets();
        const preset = presets.find(o => o.id === id);
        if (preset) {
          preset.installCount = (preset.installCount || 0) + 1;
          fs.writeFileSync(getMarketPresetsPath(), JSON.stringify(presets, null, 2));
        }
      } else {
        // 用户发布 Agent 计数更新
        const dbItem = (db.marketItems || []).find(o => o.id === id);
        if (dbItem) {
          dbItem.installCount = (dbItem.installCount || 0) + 1;
        }
      }

      await saveDB(db);
    }

    const user = db.users?.find(u => u.id === userId);
    if (user) {
      if (!user.agents) user.agents = ['lingxi'];
      if (!user.agents.includes(agentId)) {
        user.agents.push(agentId);
        user.agentsUpdatedAt = new Date().toISOString();
        await saveDB(db);
      }
    }

    res.json({ success: true, agentId });
    // 更新 dispatch-config.json
    try {
      const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
      if (server) await rebuildAndPushForUser(userId, db, server);
    } catch (e) { console.warn('安装后推送调度配置失败:', e.message); }
  } catch (err) {
    console.error('安装 Agent 失败:', err);
    res.status(500).json({ success: false, error: '安装失败: ' + err.message });
  }
});

/**
 * POST /uninstall-by-agent — 移除市场安装记录（OpenClaw 已删除后同步灵犀云状态）
 */
router.post('/uninstall-by-agent', async (req, res) => {
  try {
    const { agentId } = req.body;
    const userId = req.user.id;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ success: false, error: '缺少 agentId' });
    }

    const db = await getDB();
    let changed = false;

    if (db.marketInstalls?.length) {
      const before = db.marketInstalls.length;
      db.marketInstalls = db.marketInstalls.filter(
        m => !(m.userId === userId && m.agentId === agentId)
      );
      if (db.marketInstalls.length < before) changed = true;
    }

    const user = db.users?.find(u => u.id === userId);
    if (user?.agents?.includes(agentId)) {
      user.agents = user.agents.filter(id => id !== agentId);
      user.agentsUpdatedAt = new Date().toISOString();
      changed = true;
    }

    if (changed) await saveDB(db);

    res.json({ success: true, removed: changed });
  } catch (err) {
    console.error('同步卸载市场 Agent 失败:', err);
    res.status(500).json({ success: false, error: '同步卸载失败' });
  }
});

/**
 * POST /rate — 评价 Agent
 */
router.post('/rate', async (req, res) => {
  try {
    const { itemId, score, review } = req.body;
    const userId = req.user.id;

    if (!itemId) {
      return res.status(400).json({ success: false, error: '缺少 itemId' });
    }
    if (!score || typeof score !== 'number' || score < 1 || score > 5 || !Number.isInteger(score)) {
      return res.status(400).json({ success: false, error: '评分必须是 1-5 的整数' });
    }
    if (review && typeof review === 'string' && review.length > 200) {
      return res.status(400).json({ success: false, error: '评价不能超过200字' });
    }

    const db = await getDB();
    if (!db.marketItems) db.marketItems = [];
    if (!db.marketReviews) db.marketReviews = [];

    const official = readOfficialPresets();
    const officialItem = official.find(o => o.id === itemId);
    const userItem = db.marketItems.find(o => o.id === itemId);
    if (!officialItem && !userItem) {
      return res.status(404).json({ success: false, error: 'Agent 不存在' });
    }

    const existing = db.marketReviews.find(r => r.userId === userId && r.itemId === itemId);
    if (existing) {
      return res.status(400).json({ success: false, error: '你已经评价过该 Agent' });
    }

    db.marketReviews.push({
      itemId,
      userId,
      score,
      review: (review || '').trim().slice(0, 200),
      createdAt: new Date().toISOString(),
    });

    const reviews = getItemReviews(db, itemId);
    const totalScore = reviews.reduce((sum, r) => sum + r.score, 0);
    const reviewCount = reviews.length;
    const rating = Math.round((totalScore / reviewCount) * 10) / 10;

    if (userItem) {
      userItem.reviews = reviews;
      userItem.reviewCount = reviewCount;
      userItem.rating = rating;
    }
    if (officialItem) {
      updateOfficialPresetRating(itemId, rating, reviewCount);
    }

    await saveDB(db);

    res.json({ success: true });
  } catch (err) {
    console.error('评价失败:', err);
    res.status(500).json({ success: false, error: '评价失败' });
  }
});

/**
 * GET /my — 我发布的 Agent
 */
router.get('/my', async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getDB();
    const marketItems = db.marketItems || [];
    const myItems = marketItems.filter(item => item.userId === userId);

    res.json({ success: true, items: myItems });
  } catch (err) {
    console.error('获取我的 Agent 失败:', err);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

/**
 * POST /unpublish — 取消发布
 */
router.post('/unpublish', async (req, res) => {
  try {
    const { id } = req.body;
    const userId = req.user.id;

    if (!id) {
      return res.status(400).json({ success: false, error: '缺少 id' });
    }

    // 官方 Agent 不可删除
    const official = readOfficialPresets();
    if (official.find(o => o.id === id)) {
      return res.status(403).json({ success: false, error: '官方 Agent 不可取消发布' });
    }

    const db = await getDB();
    if (!db.marketItems) db.marketItems = [];
    const index = db.marketItems.findIndex(item => item.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Agent 不存在' });
    }

    if (db.marketItems[index].userId !== userId) {
      return res.status(403).json({ success: false, error: '无权操作' });
    }

    db.marketItems.splice(index, 1);
    await saveDB(db);

    res.json({ success: true });
  } catch (err) {
    console.error('取消发布失败:', err);
    res.status(500).json({ success: false, error: '取消发布失败' });
  }
});

export default router;
