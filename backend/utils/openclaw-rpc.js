/**
 * OpenClaw WebSocket RPC 客户端
 * 通过 WebSocket 连接用户 OpenClaw Gateway 并调用 RPC 方法
 *
 * 连接流程（protocol v4 + challenge-response）：
 * 1. 连接 WS → Gateway 自动发 connect.challenge 事件（含 nonce）
 * 2. 用 Ed25519 设备签名 + token 发 connect 请求
 * 3. 收到 connect res（ok=true）后发 RPC 请求
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let _rpcRequestId = 1000;

// 缓存设备身份（避免每次 RPC 调用都读磁盘）
let _deviceIdentity = null;

/**
 * 读取本机 OpenClaw 设备身份
 */
function getDeviceIdentity() {
  if (_deviceIdentity) return _deviceIdentity;
  try {
    // 尝试读取 OpenClaw 设备身份文件
    const paths = [
      path.resolve(__dirname, '..', '..', '..', '.openclaw', 'identity', 'device.json'),
      path.resolve('/root/.openclaw/identity/device.json'),
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        _deviceIdentity = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return _deviceIdentity;
      }
    }
  } catch (e) {
    console.warn('[openclaw-rpc] 读取设备身份失败:', e.message);
  }
  return null;
}

/**
 * 构建签名串
 * 格式: v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce
 */
function buildSignString({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
  return ['v2', deviceId, clientId, clientMode, role, scopes.join(','), String(signedAtMs), token || '', nonce].join('|');
}

/**
 * 调用用户 OpenClaw 的 RPC 方法
 *
 * @param {Object} userServer - 用户服务器信息 { ip, openclawPort, openclawSession, openclawToken }
 * @param {string} method - RPC 方法名（如 config.get, config.patch, chat.send）
 * @param {Object} params - RPC 参数
 * @param {Object} options - 可选配置
 * @param {number} options.timeout - 超时毫秒数（默认 15000）
 * @param {string} options.displayName - 连接显示名称
 * @returns {Promise<Object>} RPC 响应 { ok, payload, error, ... }
 */
export async function callOpenClawRPC(userServer, method, params = {}, options = {}) {
  const {
    timeout = 15000,
    displayName = '灵犀云管理',
  } = options;

  const basePath = userServer.openclawSession || '';
  const wsUrl = `ws://${userServer.ip}:${userServer.openclawPort}/${basePath}/ws`;

  return new Promise((resolve, reject) => {
    const reqId = `lxrpc-${_rpcRequestId++}`;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) { settled = true; ws.close(); reject(new Error('RPC timeout')); }
    }, timeout);

    const origin = `http://${userServer.ip}:${userServer.openclawPort}`;
    const ws = new WebSocket(wsUrl, { headers: { Origin: origin } });

    ws.on('error', (err) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(err); }
    });

    ws.on('close', () => {
      if (!settled) { settled = true; clearTimeout(timer); reject(new Error('WS closed before response')); }
    });

    let connected = false;
    const device = getDeviceIdentity();
    const useDeviceAuth = !!device;

    // 连接参数
    const clientId = useDeviceAuth ? 'gateway-client' : 'webchat';
    const clientMode = useDeviceAuth ? 'backend' : 'webchat';
    const role = 'operator';
    const scopes = ['operator.admin', 'operator.read', 'operator.write'];
    const token = userServer.openclawToken;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Step 1: 收到 challenge → 构建签名并发 connect
        if (!connected && msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce = msg.payload && msg.payload.nonce;
          if (!nonce) {
            if (!settled) { settled = true; clearTimeout(timer); ws.close(); reject(new Error('Challenge missing nonce')); }
            return;
          }

          const connectParams = {
            minProtocol: 4,
            maxProtocol: 4,
            client: { id: clientId, displayName, version: '1.0.0', platform: 'linux', mode: clientMode },
            role,
            scopes,
            auth: { token },
            locale: 'zh-CN',
          };

          // 如果有设备身份，加上签名
          if (useDeviceAuth) {
            const signedAtMs = Date.now();
            const signStr = buildSignString({
              deviceId: device.deviceId,
              clientId,
              clientMode,
              role,
              scopes,
              signedAtMs,
              token,
              nonce,
            });
            try {
              const privateKey = crypto.createPrivateKey(device.privateKeyPem);
              const signature = crypto.sign(null, Buffer.from(signStr), privateKey);
              connectParams.device = {
                id: device.deviceId,
                publicKey: device.publicKeyPem,
                signature: signature.toString('base64'),
                signedAt: signedAtMs,
                nonce,
              };
            } catch (e) {
              console.warn('[openclaw-rpc] 签名失败，回退到 token-only 模式:', e.message);
            }
          }

          ws.send(JSON.stringify({ type: 'req', id: 'connect', method: 'connect', params: connectParams }));
          return;
        }

        // Step 2: connect 响应
        if (!connected && msg.id === 'connect' && msg.type === 'res') {
          if (!msg.ok) {
            if (!settled) { settled = true; clearTimeout(timer); ws.close(); reject(new Error('Connect failed: ' + JSON.stringify(msg.error))); }
            return;
          }
          connected = true;
          // Step 3: 发实际 RPC 请求
          ws.send(JSON.stringify({ type: 'req', id: reqId, method, params }));
          return;
        }

        // Step 4: RPC 响应
        if (msg.id === reqId && msg.type === 'res') {
          if (!settled) { settled = true; clearTimeout(timer); ws.close(); resolve(msg); }
        }
      } catch (e) { /* ignore parse errors */ }
    });
  });
}
