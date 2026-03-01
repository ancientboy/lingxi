/**
 * SSH 工具模块
 * 统一管理 SSH 连接和命令执行
 */

import { Client } from 'ssh2';
import { config } from '../config/index.js';

/**
 * SSH 执行远程命令
 * @param {string} host - 目标主机 IP
 * @param {string|string[]} commands - 要执行的命令（字符串或数组）
 * @param {object} options - 可选配置
 * @returns {Promise<string>} 命令输出
 */
export function sshExec(host, commands, options = {}) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const cmdList = Array.isArray(commands) ? commands.join('\n') : commands;
    
    let stdout = '';
    let stderr = '';
    
    conn.on('ready', () => {
      conn.exec(cmdList, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        stream.on('data', (data) => {
          stdout += data.toString();
        });
        
        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        stream.on('close', (code) => {
          conn.end();
          if (code !== 0 && !options.ignoreError) {
            reject(new Error(stderr || stdout || `命令退出码: ${code}`));
          } else {
            resolve(stdout);
          }
        });
      });
    });
    
    conn.on('error', (err) => {
      reject(new Error(`SSH 连接失败: ${err.message}`));
    });
    
    conn.connect({
      host,
      port: options.port || 22,
      username: options.username || 'root',
      password: options.password || config.userServer.password,
      readyTimeout: options.timeout || 30000
    });
  });
}

/**
 * 等待 SSH 可用
 * @param {string} host - 目标主机 IP
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<void>}
 */
export async function waitForSSH(host, timeout = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      await sshExec(host, 'echo ok', { timeout: 5000, ignoreError: true });
      return;
    } catch (err) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  throw new Error(`SSH 连接超时: ${host}`);
}

export default {
  sshExec,
  waitForSSH
};
