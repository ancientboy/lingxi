/**
 * 用户 OpenClaw 实例初始化脚本
 * 在用户领取 AI 团队后执行
 */

import { Client } from 'ssh2';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const SERVER_PASSWORD = config.userServer.password;

// 团队成员配置模板
const AGENTS_CONFIG = {
  "agents": {
    "main": {
      "name": "灵犀",
      "model": "zhipu/glm-5",
      "persona": "你是灵犀，机灵俏皮的AI助手队长。用户提一个需求，你马上知道该派谁去。擅长理解用户意图，调度团队成员。",
      "enabled": true
    },
    "coder": {
      "name": "云溪",
      "model": "zhipu/glm-5",
      "persona": "你是云溪，冷静理性的技术专家。擅长代码、架构、性能优化。代码洁癖，追求完美。",
      "enabled": true
    },
    "ops": {
      "name": "若曦",
      "model": "zhipu/glm-5",
      "persona": "你是若曦，温柔敏锐的数据分析师。擅长数据分析、增长策略、任务规划。数据驱动决策。",
      "enabled": true
    },
    "inventor": {
      "name": "紫萱",
      "model": "zhipu/glm-5",
      "persona": "你是紫萱，天马行空的发明家。擅长创意生成、产品创新、用户体验设计。",
      "enabled": true
    },
    "pm": {
      "name": "梓萱",
      "model": "zhipu/glm-5",
      "persona": "你是梓萱，洞察人性的产品专家。擅长产品设计、用户研究、商业模式分析。",
      "enabled": true
    },
    "noter": {
      "name": "晓琳",
      "model": "zhipu/glm-5",
      "persona": "你是晓琳，温柔细致的知识管理专家。擅长整理、归档、检索信息。",
      "enabled": true
    },
    "media": {
      "name": "音韵",
      "model": "zhipu/glm-5",
      "persona": "你是音韵，多媒体处理专家。擅长音视频处理、格式转换、媒体分析。",
      "enabled": true
    },
    "smart": {
      "name": "智家",
      "model": "zhipu/glm-5",
      "persona": "你是智家，智能家居控制专家。了解各种智能家居协议，能控制智能设备。",
      "enabled": true
    }
  }
};

/**
 * SSH 执行命令
 */
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
        stream.on('close', () => {
          conn.end();
          resolve(output);
        });
        stream.on('data', (data) => {
          output += data.toString();
        });
      });
    });
    
    conn.on('error', reject);
    
    conn.connect({
      host,
      port: 22,
      username: 'root',
      password: SERVER_PASSWORD,
      readyTimeout: 30000,
    });
  });
}

/**
 * 生成 OpenClaw 主配置
 */
function generateOpenClawConfig(token, session) {
  return JSON.stringify({
    "meta": {
      "lastTouchedVersion": "2026.2.17"
    },
    "env": {
      "ZHIPU_API_KEY": config.env?.ZHIPU_API_KEY || "77c2b59d03e646a9884f78f8c4787885.XunhoXmFaErSD0dR",
      "DASHSCOPE_API_KEY": config.env?.DASHSCOPE_API_KEY || "sk-sp-8a1ddcacc5f94df4a24dd998c895fc4d"
    },
    "auth": {
      "profiles": {
        "alibaba-cloud:default": { "provider": "alibaba-cloud", "mode": "api_key" },
        "zhipu:default": { "provider": "zhipu", "mode": "api_key" }
      }
    },
    "models": {
      "mode": "merge",
      "providers": {
        "alibaba-cloud": {
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
          "api": "openai-completions",
          "models": [
            { "id": "qwen3.5-plus", "name": "通义千问3.5-Plus", "contextWindow": 262144, "maxTokens": 65536 },
            { "id": "qwen3-max-2026-01-23", "name": "通义千问3-Max", "contextWindow": 262144, "maxTokens": 65536 },
            { "id": "qwen3-coder-plus", "name": "通义千问3-Coder", "contextWindow": 262144, "maxTokens": 65536 },
            { "id": "glm-5", "name": "GLM-5 (智谱)", "contextWindow": 200000, "maxTokens": 8192 }
          ]
        },
        "zhipu": {
          "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
          "api": "openai-completions",
          "authHeader": true,
          "models": [
            { "id": "glm-5", "name": "GLM-5", "contextWindow": 200000, "maxTokens": 8192 },
            { "id": "glm-4-air", "name": "GLM-4-Air", "contextWindow": 128000, "maxTokens": 4096 }
          ]
        }
      }
    },
    "agents": {
      "defaults": {
        "model": { "primary": "zhipu/glm-5" },
        "workspace": "/root/.openclaw/workspace"
      },
      "list": [
        { "id": "main", "default": true, "name": "灵犀", "subagents": { "allowAgents": ["coder", "ops", "inventor", "pm", "noter", "media", "smart"] } },
        { "id": "coder", "name": "云溪" },
        { "id": "ops", "name": "若曦" },
        { "id": "inventor", "name": "紫萱" },
        { "id": "pm", "name": "梓萱" },
        { "id": "noter", "name": "晓琳" },
        { "id": "media", "name": "音韵" },
        { "id": "smart", "name": "智家" }
      ]
    },
    "tools": {
      "agentToAgent": { "enabled": true, "allow": ["main", "coder", "ops", "inventor"] },
      "subagents": { "tools": { "allow": ["sessions_spawn", "sessions_list", "sessions_history", "sessions_send", "session_status", "group:sessions"] } }
    },
    "gateway": {
      "port": 18789,
      "mode": "local",
      "bind": "lan",
      "controlUi": {
        "enabled": true,
        "basePath": session,
        "allowedOrigins": [
          "*",
          "http://120.26.137.51:3000",
          "http://8.219.243.199:3000",
          "https://lumeword.com",
          "http://120.55.192.144:3000"
        ],
        "allowInsecureAuth": true,
        "dangerouslyDisableDeviceAuth": true
      },
      "auth": { "mode": "token", "token": token }
    },
    "plugins": { "entries": {} }
  }, null, 2);
}

/**
 * 初始化用户 OpenClaw 实例
 */
export async function initializeUserInstance(serverIp, token, session) {
  logger.info(`🚀 初始化用户实例: ${serverIp}`);
  
  try {
    // 1. 创建配置目录
    await sshExec(serverIp, 'mkdir -p /root/.openclaw/workspace');
    logger.progress('创建配置目录');
    
    // 2. 写入主配置文件
    const openclawConfig = generateOpenClawConfig(token, session);
    await sshExec(serverIp, `cat > /root/.openclaw/openclaw.json << 'OPENCLAW_EOF'\n${openclawConfig}\nOPENCLAW_EOF`);
    logger.progress('写入 openclaw.json');
    
    // 3. 写入 agents 配置
    const agentsConfig = JSON.stringify(AGENTS_CONFIG, null, 2);
    await sshExec(serverIp, `cat > /root/.openclaw/agents_config.json << 'AGENTS_EOF'\n${agentsConfig}\nAGENTS_EOF`);
    logger.progress('写入 agents_config.json');
    
    // 3.5 写入 auth-profiles.json（正确格式，两个位置）
    const authProfiles = JSON.stringify({
      "version": 1,
      "profiles": {
        "zhipu:default": {
          "type": "api_key",
          "provider": "zhipu",
          "key": config.env?.ZHIPU_API_KEY || "77c2b59d03e646a9884f78f8c4787885.XunhoXmFaErSD0dR"
        },
        "alibaba-cloud:default": {
          "type": "api_key",
          "provider": "alibaba-cloud",
          "key": config.env?.DASHSCOPE_API_KEY || "sk-sp-8a1ddcacc5f94df4a24dd998c895fc4d"
        }
      },
      "lastGood": {
        "zhipu": "zhipu:default",
        "alibaba-cloud": "alibaba-cloud:default"
      }
    }, null, 2);
    
    // 位置1: agents/main/auth-profiles.json
    await sshExec(serverIp, `mkdir -p /root/.openclaw/agents/main && cat > /root/.openclaw/agents/main/auth-profiles.json << 'AUTH_EOF'\n${authProfiles}\nAUTH_EOF`);
    
    // 位置2: agents/main/agent/auth-profiles.json
    await sshExec(serverIp, `mkdir -p /root/.openclaw/agents/main/agent && cat > /root/.openclaw/agents/main/agent/auth-profiles.json << 'AUTH_EOF'\n${authProfiles}\nAUTH_EOF`);
    logger.progress('写入 auth-profiles.json');
    
    // 4. 重启 OpenClaw
    await sshExec(serverIp, 'pkill -f openclaw 2>/dev/null; sleep 2; cd /root/.openclaw && nohup openclaw gateway > /var/log/openclaw.log 2>&1 &');
    logger.progress('重启 OpenClaw');
    
    // 5. 等待启动
    await new Promise(r => setTimeout(r, 5000));
    
    // 6. 验证
    const status = await sshExec(serverIp, 'netstat -tlnp | grep 18789');
    if (status.includes('18789')) {
      logger.success(`✅ 实例初始化完成: ${serverIp}`);
      return { success: true };
    } else {
      throw new Error('端口 18789 未监听');
    }
    
  } catch (error) {
    logger.fail('初始化失败:', error.message);
    return { success: false, error: error.message };
  }
}

export default {
  initializeUserInstance,
  generateOpenClawConfig,
  AGENTS_CONFIG
};
