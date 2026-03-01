/**
 * 飞书配置路由
 */

import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const router = Router();

// 飞书 API 基础地址
const FEISHU_API = 'https://open.feishu.cn/open-apis';

/**
 * 获取飞书访问令牌
 */
async function getFeishuToken(appId, appSecret) {
  const response = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.msg || '获取令牌失败');
  }
  
  return data.tenant_access_token;
}

/**
 * 获取应用信息
 */
async function getAppInfo(token) {
  const response = await fetch(`${FEISHU_API}/bot/v3/info`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return await response.json();
}

/**
 * 配置飞书 - 验证并保存
 */
router.post('/configure', async (req, res) => {
  try {
    const { userId, appId, appSecret, verificationToken } = req.body;
    
    if (!appId || !appSecret) {
      return res.status(400).json({ error: 'appId 和 appSecret 不能为空' });
    }
    
    const db = await getDB();
    const userServer = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    
    if (!userServer) {
      return res.status(400).json({ error: '未找到运行中的服务器' });
    }
    
    console.log('🔧 开始配置飞书：用户 ' + userId + ', 服务器 ' + userServer.ip);
    
    // 1. 先获取飞书用户 ID（用于自动批准配对）
    let feishuUserId = null;
    try {
      const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret })
      });
      const tokenData = await tokenRes.json();
      if (tokenData.code === 0) {
        const appInfoRes = await fetch('https://open.feishu.cn/open-apis/bot/v3/info', {
          headers: { Authorization: `Bearer ${tokenData.tenant_access_token}` }
        });
        const appInfo = await appInfoRes.json();
        if (appInfo.code === 0 && appInfo.data?.bot?.owner?.id) {
          feishuUserId = appInfo.data.bot.owner.id;
          console.log('✅ 获取到飞书用户 ID: ' + feishuUserId);
        }
      }
    } catch (e) {
      console.log('⚠️ 获取飞书用户 ID 失败:', e.message);
    }
    
    // 2. SSH 执行配置
    const { Client } = await import('ssh2');
    const result = await new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        console.log('✅ SSH 连接成功');
        
        const commands = `
set -e
echo "✅ 飞书插件已预装，跳过安装"

echo "📝 配置飞书..."
cat > /tmp/feishu-config.json << 'CONFIGEOF'
{
  "channels": {
    "feishu": {
      "enabled": true,
      "appId": "\${appId}",
      "appSecret": "\${appSecret}",
      ${verificationToken ? `"verificationToken": "${verificationToken}",` : ''}
      "connectionMode": "websocket",
      "dmPolicy": "open",
      "allowFrom": ["*"]
    }
  }
}
CONFIGEOF

echo "🔧 合并配置..."
node << 'NODEEOF'
const fs = require('fs');
const original = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
const feishuConfig = JSON.parse(fs.readFileSync('/tmp/feishu-config.json', 'utf8'));
const merged = { ...original, ...feishuConfig };
fs.writeFileSync('/root/.openclaw/openclaw.json', JSON.stringify(merged, null, 2));
console.log('✅ 配置已写入');
NODEEOF

echo "🔄 重启 Gateway..."
openclaw gateway restart
sleep 8

echo "🔑 批准配对..."
${feishuUserId ? `openclaw pairing approve feishu ${feishuUserId} 2>/dev/null || echo "⚠️ 配对可能需要手动批准"` : 'echo "⚠️ 无法获取用户 ID，首次使用可能需要在飞书里发一条消息"'}

echo "✅ 配置完成！"
`;
        
        conn.exec(commands, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          
          let output = '';
          
          stream.on('data', (data) => {
            output += data.toString();
            console.log('SSH:', data.toString().trim());
          });
          
          stream.on('close', (code) => {
            conn.end();
            if (code === 0) {
              const webhookUrl = `http://${userServer.ip}:18789/feishu/events`;
              resolve({ success: true, webhookUrl, output });
            } else {
              reject(new Error(`命令执行失败 (code=${code})`));
            }
          });
        });
      })
      .on('error', (err) => {
        reject(err);
      })
      .connect({
        host: userServer.ip,
        port: userServer.sshPort,
        username: 'root',
        password: userServer.sshPassword
      });
    });
    
    // 3. 更新数据库
    const existingIndex = db.feishuConfigs?.findIndex(c => c.userId === userId) || -1;
    
    const newFeishuConfig = {
      userId,
      appId,
      appSecret,
      ...(verificationToken ? { verificationToken } : {}),
      botName: '灵犀云助手',
      status: 'active',
      webhookUrl: result.webhookUrl,
      createdAt: new Date().toISOString()
    };
    
    if (!db.feishuConfigs) db.feishuConfigs = [];
    
    if (existingIndex >= 0) {
      db.feishuConfigs[existingIndex] = newFeishuConfig;
    } else {
      db.feishuConfigs.push(newFeishuConfig);
    }
    
    await saveDB(db);
    
    console.log('✅ 飞书配置成功：' + result.webhookUrl);
    
    res.json({
      success: true,
      webhookUrl: result.webhookUrl,
      message: '飞书配置成功！请复制 Webhook 地址到飞书开放平台（如果使用 WebSocket 模式则不需要）'
    });
    
  } catch (error) {
    console.error('❌ 飞书配置失败:', error);
    res.status(500).json({ 
      error: error.message,
      message: '配置失败，请检查服务器连接'
    });
  }
});

export default router;
