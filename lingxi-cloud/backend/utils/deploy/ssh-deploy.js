/**
 * SSH 部署工具
 * 上传和部署 OpenClaw
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client: SSHClient } = require('ssh2');
import fs from 'fs';

/**
 * 等待函数
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 等待 SSH 可用
 */
export async function waitForSSH(host, port, password, timeout = 120000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const conn = new SSHClient();
        
        conn.on('ready', () => {
          conn.end();
          resolve();
        });
        
        conn.on('error', reject);
        
        conn.connect({
          host,
          port: port || 22,
          username: 'root',
          password,
          readyTimeout: 5000
        });
      });
      
      return true;
    } catch (err) {
      await sleep(3000);
    }
  }
  
  throw new Error(`SSH 连接超时: ${host}`);
}

/**
 * 上传并部署
 */
export async function uploadAndDeploy(host, packagePath, packageName, password, port = 22, useCustomImage = false) {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    
    conn.on('ready', () => {
      executeDeploy(conn, packagePath, packageName, useCustomImage, host, password, resolve, reject);
    });
    
    conn.on('error', reject);
    
    conn.connect({
      host,
      port,
      username: 'root',
      password,
      readyTimeout: 30000
    });
  });
}

/**
 * 执行部署
 */
async function executeDeploy(conn, packageFile, packageName, useCustomImage, serverIp, password, resolve, reject) {
  const remotePath = `/tmp/${packageName}`;
  
  // 上传文件
  conn.sftp((err, sftp) => {
    if (err) {
      conn.end();
      return reject(err);
    }
    
    sftp.fastPut(packageFile, remotePath, (err) => {
      if (err) {
        conn.end();
        return reject(err);
      }
      
      // 执行部署脚本
      const deployScript = `
set -e

# 解压
cd /tmp
tar -xzf ${packageName}

# 创建目录
mkdir -p /data/lingxi/config
mkdir -p /data/lingxi/logs

# 复制配置
cp config/openclaw.json /data/lingxi/config/ || true

# 部署 OpenClaw
${useCustomImage ? `
docker pull registry.cn-hangzhou.aliyuncs.com/lingxi/openclaw:latest
docker run -d --name openclaw \\
  --restart always \\
  -p 18789:18789 \\
  -v /data/lingxi/config:/root/.openclaw \\
  -v /data/lingxi/logs:/var/log \\
  registry.cn-hangzhou.aliyuncs.com/lingxi/openclaw:latest
` : `
curl -fsSL https://get.openclaw.ai | bash
cd ~/.openclaw
openclaw gateway &
`}

# 清理
rm -rf /tmp/${packageName} /tmp/lingxi-team-*

echo "✅ 部署完成"
`;

      conn.exec(deployScript, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        let output = '';
        let errorOutput = '';
        
        stream.on('data', (data) => {
          output += data.toString();
        });
        
        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        stream.on('close', (code) => {
          conn.end();
          
          if (code === 0) {
            resolve({ success: true, output });
          } else {
            reject(new Error(`部署失败: ${errorOutput || output}`));
          }
        });
      });
    });
  });
}

export default {
  sleep,
  waitForSSH,
  uploadAndDeploy
};
