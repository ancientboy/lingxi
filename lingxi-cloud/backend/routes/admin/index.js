/**
 * 管理后台路由 - 总入口
 */

import { Router } from 'express';
import authRoutes from './auth.js';
import usersRoutes from './users.js';
import modelsRoutes from './models.js';
import dashboardRoutes from './dashboard.js';
import inviteCodesRoutes from './invite-codes.js';
import serversRoutes from './servers.js';
import proxyStatsRoutes from './proxy-stats.js';

const router = Router();

// 认证
router.use('/auth', authRoutes);

// 用户管理
router.use('/users', usersRoutes);

// 模型配置
router.use('/models', modelsRoutes);

// 仪表盘
router.use('/dashboard', dashboardRoutes);

// 邀请码管理
router.use('/invite-codes', inviteCodesRoutes);

// 服务器管理
router.use('/servers', serversRoutes);

// 代理统计
router.use('/proxy-stats', proxyStatsRoutes);

export default router;
