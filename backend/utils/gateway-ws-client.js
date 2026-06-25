/**
 * 持久 OpenClaw Gateway WebSocket 客户端（多路 RPC + 事件转发）
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGatewayWsUrl } from './gateway-session-filter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _deviceIdentity = null;

function getDeviceIdentity() {
  if (_deviceIdentity) return _deviceIdentity;
  const paths = [
    path.resolve(__dirname, '..', '..', '.openclaw', 'identity', 'device.json'),
    '/root/.openclaw/identity/device.json',
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        _deviceIdentity = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return _deviceIdentity;
      }
    } catch (_) {}
  }
  return null;
}

function buildSignString({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
  return ['v2', deviceId, clientId, clientMode, role, scopes.join(','), String(signedAtMs), token || '', nonce].join('|');
}

export class GatewayWsClient {
  constructor(server, options = {}) {
    this.server = server;
    this.displayName = options.displayName || 'Lume Gateway Bridge';
    this.ws = null;
    this.connected = false;
    this._connectPromise = null;
    this.pending = new Map();
    this.eventHandlers = new Set();
    this._reqSeq = 1;
  }

  onEvent(handler) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  _emitEvent(msg) {
    for (const fn of this.eventHandlers) {
      try {
        fn(msg);
      } catch (_) {}
    }
  }

  async connect() {
    if (this.connected) return;
    if (this._connectPromise) return this._connectPromise;

    this._connectPromise = new Promise((resolve, reject) => {
      const wsUrl = buildGatewayWsUrl(this.server);
      const origin = `http://${this.server.ip}:${this.server.openclawPort || 18789}`;
      const ws = new WebSocket(wsUrl, { headers: { Origin: origin } });
      this.ws = ws;
      let settled = false;

      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._connectPromise = null;
        if (err) reject(err);
        else resolve();
      };

      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch (_) {}
        finish(new Error('Gateway 连接超时'));
      }, 15_000);

      ws.on('error', (err) => finish(err));

      ws.on('close', () => {
        this.connected = false;
        if (!settled) finish(new Error('Gateway WS closed during connect'));
        for (const [id, entry] of this.pending) {
          clearTimeout(entry.timer);
          entry.reject(new Error('Gateway WS closed'));
          this.pending.delete(id);
        }
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (!this.connected && msg.type === 'event' && msg.event === 'connect.challenge') {
            const nonce = msg.payload?.nonce;
            if (!nonce) {
              finish(new Error('Gateway challenge 缺少 nonce'));
              return;
            }

            const device = getDeviceIdentity();
            const clientId = device ? 'gateway-client' : 'openclaw-control-ui';
            const clientMode = device ? 'backend' : 'webchat';
            const role = 'operator';
            const scopes = ['operator.admin', 'operator.read', 'operator.write'];
            const token = this.server.openclawToken;

            const connectParams = {
              minProtocol: 4,
              maxProtocol: 4,
              client: {
                id: clientId,
                displayName: this.displayName,
                version: '1.0.0',
                platform: 'linux',
                mode: clientMode,
              },
              role,
              scopes,
              auth: { token },
              locale: 'zh-CN',
            };

            if (device) {
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
              } catch (_) {}
            }

            ws.send(JSON.stringify({ type: 'req', id: 'connect', method: 'connect', params: connectParams }));
            return;
          }

          if (!this.connected && msg.id === 'connect' && msg.type === 'res') {
            if (!msg.ok) {
              finish(new Error(msg.error?.message || JSON.stringify(msg.error) || 'Gateway connect failed'));
              return;
            }
            this.connected = true;
            finish(null);
            return;
          }

          if (msg.type === 'event') {
            this._emitEvent(msg);
            return;
          }

          if (msg.type === 'res' && msg.id && this.pending.has(msg.id)) {
            const entry = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            clearTimeout(entry.timer);
            if (msg.ok) entry.resolve(msg);
            else entry.reject(new Error(msg.error?.message || JSON.stringify(msg.error) || 'RPC failed'));
          }
        } catch (_) {}
      });
    });

    return this._connectPromise;
  }

  async request(method, params = {}, timeoutMs = 20_000) {
    if (!this.connected) await this.connect();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway 未连接');
    }

    const id = `gws-${this._reqSeq++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gateway RPC timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  close() {
    this.connected = false;
    this._connectPromise = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
  }
}
