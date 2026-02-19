import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';

const router = Router();

async function callOpenClawAPI(serverIp, token, session, endpoint, method = 'GET', body = null) {
  const url = `http://${serverIp}:18789/${session}${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`OpenClaw API 错误: ${response.status}`);
  }
  
  return await response.json();
}

router.post('/feishu', async (req, res) => {
  try {
    const { userId, appId, appSecret } = req.body;
    
    if (!userId || !appId || !appSecret) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    const db = await getDB();
    
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    if (!server || !server.ip) {
      return res.status(400).json({ error: '用户服务器未就绪' });
    }
    
    let config = db.userConfigs?.find(c => c.userId === userId);
    if (!config) {
      config = {
        id: `cfg-${crypto.randomUUID?.() || Date.now()}`,
        userId,
        createdAt: new Date().toISOString()
      };
      if (!db.userConfigs) db.userConfigs = [];
      db.userConfigs.push(config);
    }
    
    config.feishuAppId = appId;
    config.feishuAppSecret = appSecret;
    config.feishuEnabled = 1;
    config.updatedAt = new Date().toISOString();
    await saveDB(db);
    
    const openclawConfig = {
      channels: {
        feishu: {
          accounts: {
            default: {
              appId,
              appSecret,
              domain: "feishu",
              enabled: true
            }
          },
          dmPolicy: "pairning",
          groupPolicy: "open",
          blockStreaming: true
        }
      }
    };
    
    try {
      await callOpenClawAPI(
        server.ip,
        server.openclawToken,
        server.openclawSession,
        '/api/config/channels',
        'POST',
        openclawConfig
      );
      
      await callOpenClawAPI(
        server.ip,
        server.openclawToken,
        server.openclawSession,
        '/api/restart',
        'POST'
      );
    } catch (apiError) {
      console.log('远程同步到 OpenClaw 失败，配置已保存到数据库:', apiError.message);
    }
    
    res.json({
      success: true,
      config: {
        appId,
        enabled: true
      },
      webhook: {
        eventUrl: `http://${server.ip}:18789/feishu/events/default`,
        description: '请在飞书开放平台 → 事件订阅 中配置此地址'
      },
      message: '飞书配置已保存。OpenClaw 将自动处理飞书消息。'
    });
    
  } catch (error) {
    console.error('配置飞书失败:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/wecom', async (req, res) => {
  try {
    const { userId, corpId, agentId, secret, token, encodingAesKey } = req.body;
    
    if (!userId || !corpId || !agentId || !secret) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    const db = await getDB();
    
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    if (!server || !server.ip) {
      return res.status(400).json({ error: '用户服务器未就绪' });
    }
    
    let config = db.userConfigs?.find(c => c.userId === userId);
    if (!config) {
      config = {
        id: `cfg-${crypto.randomUUID?.() || Date.now()}`,
        userId,
        createdAt: new Date().toISOString()
      };
      if (!db.userConfigs) db.userConfigs = [];
      db.userConfigs.push(config);
    }
    
    config.wecomCorpId = corpId;
    config.wecomAgentId = agentId;
    config.wecomSecret = secret;
    config.wecomToken = token;
    config.wecomEncodingAesKey = encodingAesKey;
    config.wecomEnabled = 1;
    config.updatedAt = new Date().toISOString();
    await saveDB(db);
    
    const openclawConfig = {
      channels: {
        wecom: {
          accounts: {
            default: {
              corpId,
              agentId,
              secret,
              token: token || "",
              encodingAesKey: encodingAesKey || "",
              enabled: true
            }
          },
          dmPolicy: "pairning",
          groupPolicy: "open"
        }
      }
    };
    
    try {
      await callOpenClawAPI(
        server.ip,
        server.openclawToken,
        server.openclawSession,
        '/api/config/channels',
        'POST',
        openclawConfig
      );
      
      await callOpenClawAPI(
        server.ip,
        server.openclawToken,
        server.openclawSession,
        '/api/restart',
        'POST'
      );
    } catch (apiError) {
      console.log('远程同步到 OpenClaw 失败:', apiError.message);
    }
    
    res.json({
      success: true,
      config: {
        corpId,
        agentId,
        enabled: true
      },
      webhook: {
        callbackUrl: `http://${server.ip}:18789/wecom/callback/default`,
        description: '请在企业微信后台 → 接收消息 中配置此回调地址'
      },
      message: '企业微信配置已保存。OpenClaw 将自动处理企业微信消息。'
    });
    
  } catch (error) {
    console.error('配置企业微信失败:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents', async (req, res) => {
  try {
    const { userId, agents } = req.body;
    
    if (!userId || !agents || !Array.isArray(agents)) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    const db = await getDB();
    
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    
    let config = db.userConfigs?.find(c => c.userId === userId);
    if (!config) {
      config = {
        id: `cfg-${crypto.randomUUID?.() || Date.now()}`,
        userId,
        createdAt: new Date().toISOString()
      };
      if (!db.userConfigs) db.userConfigs = [];
      db.userConfigs.push(config);
    }
    
    config.agents = JSON.stringify(agents);
    config.updatedAt = new Date().toISOString();
    await saveDB(db);
    
    if (server && server.ip) {
      try {
        await callOpenClawAPI(
          server.ip,
          server.openclawToken,
          server.openclawSession,
          '/api/config/agents',
          'POST',
          { agents }
        );
      } catch (apiError) {
        console.log('远程同步到 OpenClaw 失败:', apiError.message);
      }
    }
    
    res.json({
      success: true,
      agents,
      message: '团队配置已保存'
    });
    
  } catch (error) {
    console.error('配置团队失败:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const server = db.userServers?.find(s => s.userId === userId);
    const config = db.userConfigs?.find(c => c.userId === userId);
    
    const openclawWebUrl = server?.ip 
      ? `http://${server.ip}:${server.openclawPort}/${server.openclawSession}?token=${server.openclawToken}`
      : null;
    
    res.json({
      server: server ? {
        id: server.id,
        ip: server.ip,
        status: server.status,
        openclawPort: server.openclawPort,
        openclawSession: server.openclawSession
      } : null,
      openclaw: {
        webUrl: openclawWebUrl,
        embedUrl: openclawWebUrl
      },
      config: config ? {
        feishu: {
          configured: !!config.feishuAppId,
          appId: config.feishuAppId,
          enabled: config.feishuEnabled === 1,
          webhookUrl: server?.ip ? `http://${server.ip}:18789/feishu/events/default` : null
        },
        wecom: {
          configured: !!config.wecomCorpId,
          corpId: config.wecomCorpId,
          enabled: config.wecomEnabled === 1,
          callbackUrl: server?.ip ? `http://${server.ip}:18789/wecom/callback/default` : null
        },
        agents: config.agents ? JSON.parse(config.agents) : ['lingxi']
      } : null
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/openclaw-url/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    
    if (!server || !server.ip) {
      return res.status(400).json({ 
        error: '用户服务器未就绪',
        status: 'not_ready'
      });
    }
    
    const openclawUrl = `http://${server.ip}:${server.openclawPort}/${server.openclawSession}?token=${server.openclawToken}`;
    
    res.json({
      success: true,
      url: openclawUrl,
      embedUrl: openclawUrl,
      server: {
        ip: server.ip,
        port: server.openclawPort,
        session: server.openclawSession
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
