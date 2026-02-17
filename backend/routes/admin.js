import { Router } from 'express';
import { generateInviteCodes, getAllInviteCodes, getDB } from '../utils/db.js';

const router = Router();

// 管理员密钥（生产环境应该用更安全的方式）
const ADMIN_KEY = process.env.ADMIN_KEY || 'lingxi-admin-2026';

// 验证管理员权限
const checkAdmin = (req, res, next) => {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: '无权限访问' });
  }
  next();
};

// 生成邀请码
router.post('/invite-codes/generate', checkAdmin, async (req, res) => {
  try {
    const { count = 10 } = req.body;
    const codes = await generateInviteCodes(count);
    res.json({ success: true, codes, count: codes.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 查看所有邀请码
router.get('/invite-codes', checkAdmin, async (req, res) => {
  try {
    const codes = await getAllInviteCodes();
    res.json({ codes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 查看数据库状态（调试用）
router.get('/status', checkAdmin, async (req, res) => {
  try {
    const db = await getDB();
    res.json({
      users: db.users.length,
      inviteCodes: db.inviteCodes.length,
      agentConfigs: db.agentConfigs.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
