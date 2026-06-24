/**
 * JWT 身份验证中间件
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { getDB } from '../utils/db.js';

const JWT_SECRET = config.security.jwtSecret;

export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供身份验证令牌' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDB();
    const user = db.users?.find((u) => u.id === decoded.userId);

    if (!user) {
      return res.status(401).json({ success: false, error: '用户不存在' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: '登录已过期' });
  }
}
