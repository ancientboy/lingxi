/**
 * 桌面客户端 API — 本机 OpenClaw 引导配置
 */

import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { getDB, saveDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import {
  OPENCLAW_VERSION,
  LUME_WS_SECRET,
  LUME_PLUGIN_PORT,
  OPENCLAW_PORT,
} from '../utils/openclaw-deploy-constants.js';

const router = Router();
const JWT_SECRET = config.security.jwtSecret;

function authUserId(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch {
    return null;
  }
}

function authProfilesPayload(zhipuKey, dashscopeKey) {
  return {
    version: 1,
    profiles: {
      'zhipu:default': {
        type: 'api_key',
        provider: 'zhipu',
        key: zhipuKey || '',
      },
      'alibaba-cloud:default': {
        type: 'api_key',
        provider: 'alibaba-cloud',
        key: dashscopeKey || '',
      },
    },
    lastGood: {
      zhipu: 'zhipu:default',
      'alibaba-cloud': 'alibaba-cloud:default',
    },
  };
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * 本机 OpenClaw 安装 / 配置引导数据
 * - 新用户默认 recommendLocalFirst，先本机再考虑云端
 * - 已有云端 ECS 的老用户 defaultConnectionMode=cloud，可后续切本机
 */
router.get('/openclaw-bootstrap', async (req, res) => {
  try {
    const userId = authUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    const db = await getDB();
    const user = db.users?.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    const cloudServer = getActiveServer(db, userId);
    const hasCloudServer = Boolean(cloudServer?.ip);
    const cloudServerRunning = cloudServer?.status === 'running' && Boolean(cloudServer?.ip);

    let gatewayToken = user.localOpenclawToken;
    let sessionId = user.localOpenclawSession;
    if (!gatewayToken) {
      gatewayToken = generateToken();
    }
    if (!sessionId) {
      sessionId = generateSessionId();
    }

    const recommendLocalFirst = !cloudServerRunning;
    const defaultConnectionMode = cloudServerRunning ? 'cloud' : 'auto';

    const zhipuKey = config.env?.ZHIPU_API_KEY || '';
    const dashscopeKey = config.env?.DASHSCOPE_API_KEY || '';

    res.json({
      success: true,
      userId,
      openclawVersion: OPENCLAW_VERSION,
      gatewayPort: OPENCLAW_PORT,
      lumePluginPort: LUME_PLUGIN_PORT,
      gatewayToken,
      sessionId,
      lumeSecret: process.env.LUME_WS_SECRET || LUME_WS_SECRET,
      env: {
        ZHIPU_API_KEY: zhipuKey,
        DASHSCOPE_API_KEY: dashscopeKey,
      },
      authProfiles: authProfilesPayload(zhipuKey, dashscopeKey),
      pluginLoadPath: '~/.openclaw/workspace/plugins/openclaw-lume',
      hasCloudServer,
      cloudServerRunning,
      recommendLocalFirst,
      defaultConnectionMode,
      needsLocalSetup: recommendLocalFirst,
    });
  } catch (error) {
    console.error('openclaw-bootstrap 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 本机安装完成后登记 token（便于多设备与后续云端切换）
 */
router.post('/openclaw-bootstrap/complete', async (req, res) => {
  try {
    const userId = authUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    const { gatewayToken, sessionId } = req.body || {};
    const db = await getDB();
    const user = db.users?.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    if (gatewayToken) user.localOpenclawToken = String(gatewayToken);
    if (sessionId) user.localOpenclawSession = String(sessionId);
    user.localOpenclawInstalledAt = new Date().toISOString();

    await saveDB(db);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
