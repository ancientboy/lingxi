/**
 * 邮箱验证码存储与限流（内存，单实例足够；多实例可换 Redis）
 */
import crypto from 'crypto';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 分钟
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 秒
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_SEND_PER_HOUR = 8;

/** @type {Map<string, { code: string, expiresAt: number, attempts: number }>} */
const store = new Map();
/** @type {Map<string, number>} */
const lastSendAt = new Map();
/** @type {Map<string, { count: number, windowStart: number }>} */
const sendHourly = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function createEmailCode(email) {
  const key = normalizeEmail(email);
  if (!isValidEmail(key)) {
    return { ok: false, error: '邮箱格式不正确' };
  }

  const now = Date.now();
  const last = lastSendAt.get(key) || 0;
  if (now - last < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000);
    return { ok: false, error: `请 ${wait} 秒后再试`, retryAfter: wait };
  }

  const hourly = sendHourly.get(key) || { count: 0, windowStart: now };
  if (now - hourly.windowStart > 3600_000) {
    hourly.count = 0;
    hourly.windowStart = now;
  }
  if (hourly.count >= MAX_SEND_PER_HOUR) {
    return { ok: false, error: '发送次数过多，请稍后再试' };
  }

  const code = generateCode();
  store.set(key, {
    code,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
  });
  lastSendAt.set(key, now);
  hourly.count += 1;
  sendHourly.set(key, hourly);

  return { ok: true, code, expiresIn: CODE_TTL_MS / 1000 };
}

export function verifyEmailCode(email, code) {
  const key = normalizeEmail(email);
  const input = String(code || '').trim();

  if (!isValidEmail(key)) {
    return { ok: false, error: '邮箱格式不正确' };
  }
  if (!/^\d{6}$/.test(input)) {
    return { ok: false, error: '验证码应为 6 位数字' };
  }

  const entry = store.get(key);
  if (!entry) {
    return { ok: false, error: '验证码无效或已过期，请重新获取' };
  }

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return { ok: false, error: '验证码已过期，请重新获取' };
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_VERIFY_ATTEMPTS) {
    store.delete(key);
    return { ok: false, error: '验证次数过多，请重新获取验证码' };
  }

  if (entry.code !== input) {
    return { ok: false, error: '验证码错误' };
  }

  store.delete(key);
  return { ok: true, email: key };
}
