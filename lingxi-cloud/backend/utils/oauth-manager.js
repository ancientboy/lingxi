/**
 * OAuth 管理器 - 支持 GitHub Copilot 等多种供应商 OAuth 授权
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OAUTH_FILE = path.join(__dirname, '..', 'data', 'oauth-tokens.json');

// 供应商 OAuth 配置
const PROVIDERS = {
  'github-copilot': {
    name: 'GitHub Copilot',
    deviceCodeUrl: 'https://github.com/login/device/code',
    accessTokenUrl: 'https://github.com/login/oauth/access_token',
    clientId: 'Iv1.b507a08c87ecfe98',
    scope: 'user:email',
  },
  // 可扩展更多供应商
};

async function loadTokens() {
  try {
    if (!fsSync.existsSync(OAUTH_FILE)) {
      await fs.writeFile(OAUTH_FILE, JSON.stringify({ tokens: {}, pending: {} }));
    }
    return JSON.parse(await fs.readFile(OAUTH_FILE, 'utf-8'));
  } catch {
    return { tokens: {}, pending: {} };
  }
}

async function saveTokens(data) {
  await fs.writeFile(OAUTH_FILE, JSON.stringify(data, null, 2));
}

// 发起 OAuth 授权
async function startOAuth(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  const res = await fetch(provider.deviceCodeUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: provider.clientId,
      scope: provider.scope,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  // 保存 pending 状态
  const tokens = await loadTokens();
  tokens.pending[providerId] = {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresAt: Date.now() + (data.expires_in || 900) * 1000,
    interval: data.interval || 5,
    startedAt: Date.now(),
  };
  await saveTokens(tokens);

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in || 900,
  };
}

// 轮询 OAuth 状态
async function checkOAuth(providerId) {
  const tokens = await loadTokens();
  const pending = tokens.pending[providerId];

  if (!pending) {
    // 检查是否已授权
    const saved = tokens.tokens[providerId];
    return saved ? { status: 'authorized', account: saved.account } : { status: 'none' };
  }

  // 检查是否过期
  if (Date.now() > pending.expiresAt) {
    delete tokens.pending[providerId];
    await saveTokens(tokens);
    return { status: 'expired' };
  }

  const provider = PROVIDERS[providerId];
  try {
    const res = await fetch(provider.accessTokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: provider.clientId,
        device_code: pending.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await res.json();

    if (data.access_token) {
      // 授权成功
      tokens.tokens[providerId] = {
        accessToken: data.access_token,
        tokenType: data.token_type || 'bearer',
        scope: data.scope || '',
        authorizedAt: Date.now(),
        account: await fetchAccount(data.access_token),
      };
      delete tokens.pending[providerId];
      await saveTokens(tokens);
      return { status: 'authorized', account: tokens.tokens[providerId].account };
    }

    if (data.error === 'authorization_pending') {
      return { status: 'pending', userCode: pending.userCode, verificationUri: pending.verificationUri };
    }

    // 其他错误
    delete tokens.pending[providerId];
    await saveTokens(tokens);
    return { status: 'error', error: data.error_description || data.error };
  } catch (e) {
    return { status: 'pending', userCode: pending.userCode, verificationUri: pending.verificationUri };
  }
}

async function fetchAccount(token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Lume-Admin' },
    });
    const user = await res.json();
    return user.login || 'unknown';
  } catch {
    return 'unknown';
  }
}

// 撤销 OAuth
async function revokeOAuth(providerId) {
  const tokens = await loadTokens();
  delete tokens.tokens[providerId];
  delete tokens.pending[providerId];
  await saveTokens(tokens);
  return { success: true };
}

// 获取所有供应商状态
async function getAllProviderStatus() {
  const tokens = await loadTokens();
  const result = {};

  for (const [id, provider] of Object.entries(PROVIDERS)) {
    const saved = tokens.tokens[id];
    const pending = tokens.pending[id];
    result[id] = {
      name: provider.name,
      authorized: !!saved,
      account: saved?.account || null,
      pending: !!pending,
      userCode: pending?.userCode || null,
      verificationUri: pending?.verificationUri || null,
      authorizedAt: saved?.authorizedAt || null,
    };
  }

  return result;
}

// 获取 OAuth access token（给 Gateway/代理使用）
async function getAccessToken(providerId) {
  const tokens = await loadTokens();
  const saved = tokens.tokens[providerId];
  return saved?.accessToken || null;
}

export {
  startOAuth,
  checkOAuth,
  revokeOAuth,
  getAllProviderStatus,
  getAccessToken,
  PROVIDERS,
};
