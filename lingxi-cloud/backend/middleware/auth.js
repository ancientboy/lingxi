/**
 * 身份验证中间件
 * 确保用户只能操作自己的资源
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { getDB } from '../utils/db.js';

const JWT_SECRET = config.security.jwtSecret;

/**
 * 验证 JWT Token 并加载用户信息
 */
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: '未提供身份验证令牌' 
    });
  }
  
  const token = authHeader.substring(7); // 去掉 'Bearer '
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 从数据库加载用户信息
    const db = await getDB();
    const user = db.users.find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: '用户不存在' 
      });
    }
    
    // 将用户信息附加到 req
    req.user = {
      id: user.id,
      nickname: user.nickname,
      isAdmin: user.isAdmin || false
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      error: '无效的身份验证令牌' 
    });
  }
}

/**
 * 检查用户权限
 * 管理员可以访问所有资源
 * 普通用户只能访问自己的资源
 */
export async function checkOwnership(req, res, next) {
  const { userId } = req.params;
  const currentUserId = req.user?.id;
  const isAdmin = req.user?.isAdmin || false;
  
  if (!currentUserId) {
    return res.status(401).json({ 
      success: false, 
      error: '未认证的用户' 
    });
  }
  
  // 管理员可以访问所有资源
  if (isAdmin) {
    console.log(`🔓 [管理员权限] ${req.user.nickname}(${currentUserId}) 访问用户 ${userId} 的资源`);
    return next();
  }
  
  // 普通用户只能访问自己的资源
  if (userId !== currentUserId) {
    console.warn(`⚠️ [权限拒绝] 用户 ${currentUserId} 尝试访问 ${userId} 的资源`);
    return res.status(403).json({ 
      success: false, 
      error: '无权访问此资源' 
    });
  }
  
  next();
}

/**
 * 组合中间件：验证 Token + 检查权限
 */
export async function authAndCheckOwnership(req, res, next) {
  try {
    await verifyToken(req, res, () => {});
    await checkOwnership(req, res, next);
  } catch (error) {
    // 错误已在中间件中处理
  }
}

/**
 * 仅管理员可访问
 */
export async function adminOnly(req, res, next) {
  const isAdmin = req.user?.isAdmin || false;
  
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: '需要管理员权限'
    });
  }
  
  next();
}
