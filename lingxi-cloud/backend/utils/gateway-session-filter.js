/**
 * Gateway 会话列表 / 历史清洗 — 与 openclaw-lume gateway-api 对齐
 */

const SYSTEM_SESSION_PATTERNS = [
  /:cron:/i,
  /:subagent:/i,
  /^agent:main:main$/i,
  /^agent:ops:main$/i,
  /^agent:main:(boot|allow-check|verify-|cli-test)/i,
];

const HIDDEN_ROLES = new Set(['tool', 'toolresult', 'system']);
const NOISE_TEXT = new Set(['HEARTBEAT_OK', 'NO_REPLY']);
const FAILED_PLACEHOLDER = '[assistant turn failed before producing content]';

export function resolveUserSessionPrefix(userId) {
  return `agent:main:user_${userId.substring(0, 8)}`;
}

export function isSystemSessionKey(sessionKey) {
  return SYSTEM_SESSION_PATTERNS.some((re) => re.test(sessionKey));
}

export function isListableChatSession(sessionKey, userId, _session) {
  if (!sessionKey || !userId) return false;
  return !isSystemSessionKey(sessionKey);
}

function extractTextContent(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => typeof b === 'object' && b && b.type === 'text')
      .map((b) => String(b.text ?? ''))
      .join('');
  }
  return String(content);
}

function extractMessageId(msg, index) {
  const oc = msg.__openclaw;
  if (oc?.id) return String(oc.id);
  if (msg.id) return String(msg.id);
  const role = String(msg.role ?? 'unknown');
  const ts = msg.timestamp ?? msg.createdAt ?? index;
  return `${role}-${ts}-${index}`;
}

function shouldSkipMessage(msg, text) {
  const role = String(msg.role ?? '').toLowerCase();
  if (HIDDEN_ROLES.has(role)) return true;
  const trimmed = text.trim();
  if (!trimmed && role === 'assistant' && !msg.errorMessage) return true;
  if (NOISE_TEXT.has(trimmed)) return true;
  if (trimmed.startsWith('Read HEARTBEAT.md') && trimmed.length < 100) return true;
  if (trimmed.includes('<<<EXTERNAL_UNTRUSTED_CONTENT')) return true;
  if (trimmed.includes('SECURITY NOTICE:')) return true;
  return false;
}

function normalizeHistoryMessage(msg, index) {
  const role = String(msg.role ?? 'assistant');
  let text = extractTextContent(msg.content);

  if (shouldSkipMessage(msg, text)) return null;

  if (role === 'assistant') {
    const err = typeof msg.errorMessage === 'string' ? msg.errorMessage.trim() : '';
    if (err && (!text || text === FAILED_PLACEHOLDER)) {
      text = `⚠️ 模型调用失败：${err}`;
    } else if (text === FAILED_PLACEHOLDER) {
      return null;
    }
  }

  if (!text.trim() && role !== 'user') return null;

  const id = extractMessageId(msg, index);
  const createdAt = msg.timestamp ?? msg.createdAt ?? Date.now();

  const normalized = {
    id,
    role,
    content: text,
    createdAt,
    timestamp: createdAt,
  };

  if (msg.model) normalized.model = msg.model;
  if (msg.provider) normalized.modelProvider = msg.provider;
  if (msg.usage) normalized.usage = msg.usage;
  if (msg.attachments) normalized.attachments = msg.attachments;

  return normalized;
}

export function sanitizeHistoryMessages(raw) {
  const messages = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const normalized = normalizeHistoryMessage(item, i);
    if (normalized) messages.push(normalized);
  }
  return { messages, totalRaw: raw.length, visibleCount: messages.length };
}

export function filterSessionList(sessions, userId) {
  if (!Array.isArray(sessions)) return [];
  const prefix = resolveUserSessionPrefix(userId);
  return sessions.filter((s) => {
    if (!s || typeof s !== 'object') return false;
    const key = String(s.key ?? '');
    return isListableChatSession(key, userId, s);
  });
}

const ALLOWED_GATEWAY_EXACT = new Set([
  'config.get',
  'config.patch',
  'agents.delete',
  'health',
  'status',
  'tools.invoke',
  'cron.list',
  'cron.add',
  'cron.update',
  'cron.remove',
  'cron.run',
  'cron.runs',
  'cron.status',
]);

export function isAllowedGatewayMethod(method) {
  const m = String(method || '').trim();
  if (!m) return false;
  if (ALLOWED_GATEWAY_EXACT.has(m)) return true;
  return m.startsWith('cron.');
}

export function buildGatewayWsUrl(server) {
  const basePath = server.openclawSession || '';
  const port = server.openclawPort || 18789;
  return `ws://${server.ip}:${port}/${basePath}/ws`;
}
