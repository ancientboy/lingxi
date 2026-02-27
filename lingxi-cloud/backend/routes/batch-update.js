/**
 * 批量更新路由 - 更新所有用户服务器的 OpenClaw 配置
 */

import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import { sshExec } from '../utils/ssh.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const router = Router();
const SERVER_PASSWORD = config.userServer.password;

/**
 * SSH 执行命令
 */
router.get('/version', (req, res) => {
  try {
    const versionFile = path.join(PROJECT_ROOT, 'installer', 'VERSION.json');
    
    if (fs.existsSync(versionFile)) {
      const version = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      res.json({ success: true, version });
    } else {
      res.json({ 
        success: true, 
        version: {
          configVersion: '2.1.1',
          openclawVersion: '2026.2.17',
          updatedAt: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新单个用户服务器的配置
 */
router.post('/update/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { components = ['config', 'agents', 'skills'] } = req.body;
    
    const db = await getDB();
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    
    if (!server || !server.ip) {
      return res.status(404).json({ error: '用户服务器未运行' });
    }
    
    logger.info(`开始更新用户 ${userId} 的服务器 ${server.ip}`);
    
    // 构建更新命令
    let commands = 'set -e\n';
    
    // 备份
    commands += 'echo "📦 备份现有配置..."\n';
    commands += 'cp -r ~/.openclaw ~/.openclaw.bak.$(date +%s) 2>/dev/null || true\n';
    
    // 更新配置文件
    if (components.includes('config')) {
      const configPath = path.join(PROJECT_ROOT, 'installer', 'config', 'openclaw.json');
      if (fs.existsSync(configPath)) {
        let configContent = fs.readFileSync(configPath, 'utf8');
        // 替换占位符
        configContent = configContent
          .replace(/GATEWAY_TOKEN_PLACEHOLDER/g, server.openclawToken)
          .replace(/SESSION_ID_PLACEHOLDER/g, server.openclawSession);
        
        // 通过 SSH 写入配置
        commands += `echo '📝 更新配置文件...'\n`;
        commands += `cat > ~/.openclaw/openclaw.json << 'CONFIG_EOF'\n${configContent}\nCONFIG_EOF\n`;
      }
    }
    
    // 更新 Agent 配置
    if (components.includes('agents')) {
      const agentsDir = path.join(PROJECT_ROOT, 'installer', 'agents');
      
      commands += `echo '📝 更新 Agent 配置...'\n`;
      
      // 遍历所有 agent
      const agents = ['lingxi', 'coder', 'ops', 'inventor', 'pm', 'noter', 'media', 'smart'];
      for (const agent of agents) {
        const agentPath = path.join(agentsDir, agent);
        if (fs.existsSync(agentPath)) {
          // 创建目录
          commands += `mkdir -p ~/.openclaw/agents/${agent}/agent\n`;
          
          // 复制 SOUL.md
          const soulPath = path.join(agentPath, 'SOUL.md');
          if (fs.existsSync(soulPath)) {
            const soulContent = fs.readFileSync(soulPath, 'utf8');
            commands += `cat > ~/.openclaw/agents/${agent}/agent/SOUL.md << 'SOUL_EOF'\n${soulContent}\nSOUL_EOF\n`;
          }
          
          // 复制 TEAM.md（仅 lingxi）
          const teamPath = path.join(agentPath, 'TEAM.md');
          if (fs.existsSync(teamPath)) {
            const teamContent = fs.readFileSync(teamPath, 'utf8');
            commands += `cat > ~/.openclaw/agents/${agent}/agent/TEAM.md << 'TEAM_EOF'\n${teamContent}\nTEAM_EOF\n`;
          }
          
          // 复制 WORKFLOW.md（仅 lingxi）
          const workflowPath = path.join(agentPath, 'WORKFLOW.md');
          if (fs.existsSync(workflowPath)) {
            const workflowContent = fs.readFileSync(workflowPath, 'utf8');
            commands += `cat > ~/.openclaw/agents/${agent}/agent/WORKFLOW.md << 'WORKFLOW_EOF'\n${workflowContent}\nWORKFLOW_EOF\n`;
          }
        }
      }
    }
    
    // 更新 Skills
    if (components.includes('skills')) {
      commands += `echo '📝 更新 Skills...'\n`;
      commands += `mkdir -p ~/.openclaw/skills\n`;
      // Skills 通过 rsync 或 scp 同步更合适，这里简化处理
    }
    
    // 重启服务
    commands += `echo '🔄 重启服务...'\n`;
    commands += `systemctl restart openclaw || (pkill -f openclaw; sleep 2; cd ~/.openclaw && nohup openclaw gateway > /var/log/openclaw.log 2>&1 &)\n`;
    commands += `sleep 5\n`;
    commands += `systemctl status openclaw --no-pager | head -5 || echo "服务已重启"\n`;
    
    commands += `echo '✅ 更新完成!'\n`;
    
    // 执行更新
    const result = await sshExec(server.ip, commands);
    
    logger.success(`用户 ${userId} 的服务器更新完成`);
    
    res.json({
      success: true,
      message: '更新完成',
      server: server.ip,
      output: result.split('\n').slice(-10).join('\n')
    });
    
  } catch (error) {
    logger.fail('更新失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量更新所有用户服务器
 */
router.post('/update-all', async (req, res) => {
  try {
    const { components = ['config', 'agents'] } = req.body;
    
    const db = await getDB();
    const servers = db.userServers?.filter(s => s.status === 'running') || [];
    
    if (servers.length === 0) {
      return res.json({ success: true, message: '没有运行中的服务器' });
    }
    
    logger.info(`开始批量更新 ${servers.length} 台服务器`);
    
    const results = {
      total: servers.length,
      success: 0,
      failed: 0,
      details: []
    };
    
    // 并行更新（最多 5 个并发）
    const batchSize = 5;
    for (let i = 0; i < servers.length; i += batchSize) {
      const batch = servers.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (server) => {
          const user = db.users.find(u => u.id === server.userId);
          
          try {
            // 调用单个更新
            const updateRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/batch-update/update/${server.userId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ components })
            });
            
            const data = await updateRes.json();
            
            return {
              userId: server.userId,
              userName: user?.nickname || server.userId,
              ip: server.ip,
              status: 'success',
              message: data.message
            };
          } catch (error) {
            return {
              userId: server.userId,
              userName: user?.nickname || server.userId,
              ip: server.ip,
              status: 'failed',
              message: error.message
            };
          }
        })
      );
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.details.push(result.value);
          if (result.value.status === 'success') {
            results.success++;
          } else {
            results.failed++;
          }
        } else {
          results.failed++;
        }
      });
      
      // 批次间隔
      if (i + batchSize < servers.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    logger.info(`批量更新完成: 成功 ${results.success}, 失败 ${results.failed}`);
    
    res.json({
      success: true,
      ...results
    });
    
  } catch (error) {
    logger.fail('批量更新失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 检查所有服务器状态
 */
router.get('/status', async (req, res) => {
  try {
    const db = await getDB();
    const servers = db.userServers || [];
    
    const statusList = servers.map(server => {
      const user = db.users.find(u => u.id === server.userId);
      return {
        userId: server.userId,
        userName: user?.nickname || server.userId,
        ip: server.ip,
        status: server.status,
        lastUpdate: server.healthCheckedAt,
        openclawUrl: server.ip ? `http://${server.ip}:${server.openclawPort}/${server.openclawSession}?token=${server.openclawToken}` : null
      };
    });
    
    res.json({
      success: true,
      total: servers.length,
      running: servers.filter(s => s.status === 'running').length,
      servers: statusList
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
