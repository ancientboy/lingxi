/**
 * 基因系统 API
 * 
 * 功能：
 * - 用户上报基因
 * - 增量同步基因
 * - 管理员审核基因
 */

import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// ============ 辅助函数：推送基因到所有实例 ============
/**
 * 审核通过后主动推送给所有在线用户实例
 * 
 * 使用 OpenClaw Gateway 的 /hooks/wake API 推送系统事件
 */
async function pushGeneToAllInstances(geneId, db) {
  const results = { success: 0, failed: 0, details: [] };
  const userServers = db.userServers || [];
  
  for (const server of userServers) {
    if (server.status !== 'running') continue;
    
    try {
      // 使用 OpenClaw Gateway /hooks/wake API 推送
      const response = await fetch(`http://${server.ip}:${server.openclawPort}/hooks/wake`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${server.openclawToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: `🧬 基因更新通知：平台发布了新基因「${geneId}」，请调用基因同步接口获取更新。`,
          mode: 'now'  // 立即唤醒
        })
      });
      
      if (response.ok) {
        results.success++;
        results.details.push({ server: server.id, status: 'success' });
      } else {
        results.failed++;
        results.details.push({ server: server.id, status: 'failed', error: response.statusText });
      }
    } catch (error) {
      results.failed++;
      results.details.push({ server: server.id, status: 'error', error: error.message });
    }
  }
  
  // 记录推送历史
  if (!db.genePushHistory) {
    db.genePushHistory = [];
  }
  db.genePushHistory.push({
    geneId,
    pushedAt: new Date().toISOString(),
    results: {
      success: results.success,
      failed: results.failed,
      details: results.details
    }
  });
  
  return results;
}

// ============ 中间件：验证用户 Token ============
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  
  const token = authHeader.substring(7);
  
  // 测试模式：允许 test-token
  if (token === 'test-token' || token === 'admin-test-token') {
    req.userId = token === 'admin-test-token' ? 'admin' : 'test-user';
    return next();
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
};

// ============ 中间件：验证管理员 Token ============
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  
  const token = authHeader.substring(7);
  
  // 测试模式：允许 admin-test-token
  if (token === 'admin-test-token') {
    req.userId = 'admin';
    return next();
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // TODO: 添加管理员权限验证
    // 目前简单验证为有 token 即可
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
};

// ============ 公开 API ============

/**
 * POST /api/genes/upload
 * 接收用户上报的基因
 */
router.post('/upload', authenticateUser, async (req, res) => {
  try {
    const { genes, instance_id } = req.body;
    const user_id = req.userId;
    
    if (!genes || !Array.isArray(genes) || genes.length === 0) {
      return res.status(400).json({ error: '请提供有效的基因数据' });
    }
    
    const db = await getDB();
    
    // 初始化候选基因库（如果不存在）
    if (!db.candidateGenes) {
      db.candidateGenes = [];
    }
    
    // 添加到候选基因库
    for (const gene of genes) {
      const candidate = {
        id: gene.id || `candidate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        gene: gene,
        source_user: user_id,
        source_instance: instance_id,
        status: 'pending',
        similarity: calculateSimilarity(gene, db.platformGenes || []),
        created_at: new Date().toISOString()
      };
      db.candidateGenes.push(candidate);
    }
    
    await saveDB(db);
    
    res.json({
      success: true,
      received: genes.length
    });
  } catch (error) {
    console.error('上报基因错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/genes/updates?since={timestamp}
 * 增量同步基因
 */
router.get('/updates', authenticateUser, async (req, res) => {
  try {
    const since = parseInt(req.query.since) || 0;
    const db = await getDB();
    
    const platformGenes = db.platformGenes || [];
    
    // 过滤出更新的基因
    const updatedGenes = platformGenes.filter(gene => {
      const updatedAt = new Date(gene.metadata?.updated_at || 0).getTime();
      return updatedAt > since;
    });
    
    // 找出已删除的基因（如果有 deletedGenes 记录）
    const deletedGenes = (db.deletedGenes || [])
      .filter(d => d.deleted_at > since)
      .map(d => d.id);
    
    res.json({
      genes: updatedGenes,
      deleted: deletedGenes,
      sync_time: Date.now()
    });
  } catch (error) {
    console.error('同步基因错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/genes/platform
 * 获取全部平台基因（首次同步）
 */
router.get('/platform', authenticateUser, async (req, res) => {
  try {
    const db = await getDB();
    const platformGenes = db.platformGenes || [];
    
    res.json({
      genes: platformGenes,
      sync_time: Date.now()
    });
  } catch (error) {
    console.error('获取平台基因错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ 管理员 API ============

/**
 * GET /api/admin/genes/candidates
 * 获取候选基因
 */
router.get('/admin/candidates', authenticateAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const candidates = db.candidateGenes || [];
    
    // 只返回待审核的
    const pendingCandidates = candidates.filter(c => c.status === 'pending');
    
    res.json({
      candidates: pendingCandidates
    });
  } catch (error) {
    console.error('获取候选基因错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/genes/approve/:geneId
 * 审核通过
 */
router.post('/admin/approve/:geneId', authenticateAdmin, async (req, res) => {
  try {
    const { geneId } = req.params;
    const { merge_to } = req.body;
    
    const db = await getDB();
    
    // 初始化平台基因库
    if (!db.platformGenes) {
      db.platformGenes = [];
    }
    
    // 查找候选基因
    const candidateIndex = (db.candidateGenes || []).findIndex(c => c.id === geneId);
    
    if (candidateIndex === -1) {
      return res.status(404).json({ error: '候选基因不存在' });
    }
    
    const candidate = db.candidateGenes[candidateIndex];
    
    if (merge_to) {
      // 合并到现有基因
      const existingGeneIndex = db.platformGenes.findIndex(g => g.id === merge_to);
      if (existingGeneIndex !== -1) {
        // 简单合并：更新现有基因的元数据
        const existingGene = db.platformGenes[existingGeneIndex];
        existingGene.metadata = {
          ...existingGene.metadata,
          updated_at: new Date().toISOString(),
          usage_count: (existingGene.metadata?.usage_count || 0) + 1
        };
      }
    } else {
      // 作为新基因添加到平台基因库
      const gene = {
        ...candidate.gene,
        metadata: {
          ...candidate.gene.metadata,
          author: 'platform',
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      };
      db.platformGenes.push(gene);
    }
    
    // 更新候选基因状态
    db.candidateGenes[candidateIndex].status = 'approved';
    
    // 记录使用统计
    if (!db.geneUsage) {
      db.geneUsage = [];
    }
    db.geneUsage.push({
      gene_id: geneId,
      action: 'approved',
      by_user: req.userId,
      at: new Date().toISOString()
    });
    
    await saveDB(db);
    
    // 审核通过后自动推送给所有在线用户
    const pushResults = await pushGeneToAllInstances(geneId, db);
    
    res.json({
      success: true,
      message: merge_to ? '已合并到现有基因' : '已添加到平台基因库',
      pushed: pushResults.success,
      pushFailed: pushResults.failed
    });
  } catch (error) {
    console.error('审核基因错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/genes/reject/:geneId
 * 拒绝基因
 */
router.post('/admin/reject/:geneId', authenticateAdmin, async (req, res) => {
  try {
    const { geneId } = req.params;
    const { reason } = req.body;
    
    const db = await getDB();
    
    // 查找候选基因
    const candidateIndex = (db.candidateGenes || []).findIndex(c => c.id === geneId);
    
    if (candidateIndex === -1) {
      return res.status(404).json({ error: '候选基因不存在' });
    }
    
    // 更新状态
    db.candidateGenes[candidateIndex].status = 'rejected';
    db.candidateGenes[candidateIndex].rejected_reason = reason;
    db.candidateGenes[candidateIndex].rejected_at = new Date().toISOString();
    
    // 记录使用统计
    if (!db.geneUsage) {
      db.geneUsage = [];
    }
    db.geneUsage.push({
      gene_id: geneId,
      action: 'rejected',
      reason: reason,
      by_user: req.userId,
      at: new Date().toISOString()
    });
    
    await saveDB(db);
    
    res.json({
      success: true
    });
  } catch (error) {
    console.error('拒绝基因错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ 管理员 API：基因推送 ============

/**
 * POST /api/genes/admin/push
 * 推送新基因给所有在线用户
 * 
 * 请求体: { geneIds: string[], message?: string }
 */
router.post('/admin/push', authenticateAdmin, async (req, res) => {
  try {
    const { geneIds, message } = req.body;
    
    if (!geneIds || !Array.isArray(geneIds) || geneIds.length === 0) {
      return res.status(400).json({ error: '请提供要推送的基因ID列表' });
    }
    
    const db = await getDB();
    
    // 获取要推送的基因
    const platformGenes = db.platformGenes || [];
    const genesToPush = platformGenes.filter(g => geneIds.includes(g.id));
    
    if (genesToPush.length === 0) {
      return res.status(404).json({ error: '未找到指定的基因' });
    }
    
    // 获取所有在线用户的服务器
    const userServers = db.userServers || [];
    const onlineServers = userServers.filter(s => s.status === 'running');
    
    if (onlineServers.length === 0) {
      return res.json({
        success: true,
        pushed: 0,
        message: '没有在线用户'
      });
    }
    
    // 推送通知到每个用户实例
    const pushResults = [];
    const pushErrors = [];
    
    for (const server of onlineServers) {
      try {
        const result = await pushGeneToInstance(server, genesToPush, message);
        pushResults.push({
          userId: server.userId,
          serverId: server.id,
          success: true,
          ...result
        });
      } catch (error) {
        pushErrors.push({
          userId: server.userId,
          serverId: server.id,
          error: error.message
        });
      }
    }
    
    // 记录推送历史
    if (!db.genePushHistory) db.genePushHistory = [];
    db.genePushHistory.push({
      id: `push-${Date.now()}`,
      geneIds,
      geneNames: genesToPush.map(g => g.name),
      message,
      pushedBy: req.userId,
      pushedAt: new Date().toISOString(),
      recipientCount: pushResults.length,
      errorCount: pushErrors.length
    });
    await saveDB(db);
    
    res.json({
      success: true,
      pushed: pushResults.length,
      genes: genesToPush.length,
      results: pushResults,
      errors: pushErrors.length > 0 ? pushErrors : undefined
    });
    
  } catch (error) {
    console.error('推送基因错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/genes/admin/push/:userId
 * 推送基因给指定用户
 */
router.post('/admin/push/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { geneIds, message } = req.body;
    
    if (!geneIds || !Array.isArray(geneIds) || geneIds.length === 0) {
      return res.status(400).json({ error: '请提供要推送的基因ID列表' });
    }
    
    const db = await getDB();
    
    // 获取要推送的基因
    const platformGenes = db.platformGenes || [];
    const genesToPush = platformGenes.filter(g => geneIds.includes(g.id));
    
    if (genesToPush.length === 0) {
      return res.status(404).json({ error: '未找到指定的基因' });
    }
    
    // 查找用户服务器
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    
    if (!server) {
      return res.status(404).json({ error: '用户不在线或没有运行中的实例' });
    }
    
    // 推送
    const result = await pushGeneToInstance(server, genesToPush, message);
    
    res.json({
      success: true,
      userId,
      serverId: server.id,
      genes: genesToPush.length,
      ...result
    });
    
  } catch (error) {
    console.error('推送基因给用户错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/genes/admin/push/history
 * 获取推送历史
 */
router.get('/admin/push/history', authenticateAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const history = db.genePushHistory || [];
    
    // 按时间倒序
    history.sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt));
    
    res.json({
      success: true,
      total: history.length,
      history: history.slice(0, 50)  // 最近50条
    });
    
  } catch (error) {
    console.error('获取推送历史错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 推送基因到用户实例
 * @param {Object} server - 用户服务器信息
 * @param {Array} genes - 要推送的基因列表
 * @param {string} message - 可选的推送消息
 */
async function pushGeneToInstance(server, genes, message) {
  const gatewayUrl = `http://${server.ip}:${server.openclawPort}`;
  const gatewayToken = server.openclawToken;
  const gatewaySession = server.openclawSession;
  
  // 构建推送消息
  const pushMessage = {
    type: 'gene_push',
    data: {
      genes: genes,
      message: message || `平台推送了 ${genes.length} 个新基因`,
      pushedAt: new Date().toISOString()
    }
  };
  
  // 通过 sessions_send 发送通知
  const response = await fetch(`${gatewayUrl}/${gatewaySession}/api/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${gatewayToken}`
    },
    body: JSON.stringify({
      type: 'gene_push',
      payload: pushMessage
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`推送失败: ${response.status} ${error}`);
  }
  
  return {
    geneCount: genes.length,
    geneNames: genes.map(g => g.name)
  };
}

// ============ 辅助函数 ============

/**
 * 计算基因与现有平台基因的相似度
 * @param {Object} gene - 待检测基因
 * @param {Array} platformGenes - 平台基因库
 * @returns {Object} - { "gene-xxx": 0.85 }
 */
function calculateSimilarity(gene, platformGenes) {
  const similarity = {};
  
  for (const platformGene of platformGenes) {
    const score = calculateGeneSimilarity(gene, platformGene);
    if (score > 0.3) {  // 只记录相似度 > 0.3 的
      similarity[platformGene.id] = Math.round(score * 100) / 100;
    }
  }
  
  return similarity;
}

/**
 * 计算两个基因的相似度（简单实现）
 * @returns {number} 0-1 之间的相似度分数
 */
function calculateGeneSimilarity(gene1, gene2) {
  // 简单的关键词匹配
  const keywords1 = extractKeywords(`${gene1.name} ${gene1.trigger} ${gene1.strategy?.description || ''}`);
  const keywords2 = extractKeywords(`${gene2.name} ${gene2.trigger} ${gene2.strategy?.description || ''}`);
  
  if (keywords1.length === 0 || keywords2.length === 0) {
    return 0;
  }
  
  const intersection = keywords1.filter(k => keywords2.includes(k));
  const union = [...new Set([...keywords1, ...keywords2])];
  
  return intersection.length / union.length;
}

/**
 * 提取关键词
 */
function extractKeywords(text) {
  if (!text) return [];
  
  // 简单的分词（按空格、标点）
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1);
}

export default router;
