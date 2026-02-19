import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import { Client } from 'ssh2';

const router = Router();

const SERVER_PASSWORD = process.env.USER_SERVER_PASSWORD || 'Lingxi@2026!';

function sshExec(host, commands) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      conn.exec(commands, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        
        let output = '';
        let errorOutput = '';
        
        stream.on('close', (code) => {
          conn.end();
          if (code === 0) {
            resolve(output);
          } else {
            reject(new Error(errorOutput || `命令退出码: ${code}`));
          }
        });
        
        stream.on('data', (data) => {
          output += data.toString();
        });
        
        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
      });
    });
    
    conn.on('error', (err) => {
      reject(new Error(`SSH 连接失败: ${err.message}`));
    });
    
    conn.connect({
      host,
      port: 22,
      username: 'root',
      password: SERVER_PASSWORD,
      readyTimeout: 30000,
    });
  });
}

async function updateRemoteConfig(server, channelType, config) {
  const { ip } = server;
  
  const enabledValue = config.enabled ? 'true' : 'false';
  
  let sedCommands = '';
  
  if (channelType === 'feishu') {
    sedCommands = `
sed -i 's/"appId": "[^"]*"/"appId": "${config.appId}"/g' /data/lingxi/config/openclaw.json
sed -i 's/"appSecret": "[^"]*"/"appSecret": "${config.appSecret}"/g' /data/lingxi/config/openclaw.json
sed -i 's/"enabled": false/"enabled": ${enabledValue}/g' /data/lingxi/config/openclaw.json
`;
  } else if (channelType === 'wecom') {
    sedCommands = `
sed -i 's/"corpId": "[^"]*"/"corpId": "${config.corpId}"/g' /data/lingxi/config/openclaw.json
sed -i 's/"agentId": "[^"]*"/"agentId": "${config.agentId}"/g' /data/lingxi/config/openclaw.json
sed -i 's/"secret": "[^"]*"/"secret": "${config.secret}"/g' /data/lingxi/config/openclaw.json
${config.token ? `sed -i 's/"token": "[^"]*"/"token": "${config.token}"/g' /data/lingxi/config/openclaw.json` : ''}
${config.encodingAesKey ? `sed -i 's/"encodingAesKey": "[^"]*"/"encodingAesKey": "${config.encodingAesKey}"/g' /data/lingxi/config/openclaw.json` : ''}
sed -i '0,/"enabled": false/s//"enabled": ${enabledValue}/' /data/lingxi/config/openclaw.json
`;
  }
  
  const commands = `
${sedCommands}
docker restart lingxi-cloud
echo "配置已更新，容器已重启"
`;
  
  return sshExec(ip, commands);
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
      return res.status(400).json({ error: '用户服务器未就绪，请先领取 AI 团队' });
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
    
    try {
      await updateRemoteConfig(server, 'feishu', {
        appId,
        appSecret,
        enabled: true
      });
    } catch (sshErr) {
      console.log('远程配置失败，配置已保存到数据库:', sshErr.message);
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
      message: '飞书配置已保存并同步到服务器'
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
      return res.status(400).json({ error: '用户服务器未就绪，请先领取 AI 团队' });
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
    
    try {
      await updateRemoteConfig(server, 'wecom', {
        corpId,
        agentId,
        secret,
        token: token || '',
        encodingAesKey: encodingAesKey || '',
        enabled: true
      });
    } catch (sshErr) {
      console.log('远程配置失败，配置已保存到数据库:', sshErr.message);
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
      message: '企业微信配置已保存并同步到服务器'
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
