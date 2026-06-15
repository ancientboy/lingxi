/**
 * 模型路由工具 — 统一拦截已停用的 OpenCode Go (ocg/*) 链路
 */

export const GLM_CN_PRIMARY = 'glm-cn/glm-5.1';

export function isOpenCodeGoModel(model) {
  if (!model) return false;
  const m = String(model);
  return m.startsWith('ocg/') || m.startsWith('opencode-go/');
}

/** 将 ocg/* 重定向到智谱 Coding Plan，其余原样返回 */
export function sanitizeRouterModel(model) {
  if (!model) return GLM_CN_PRIMARY;
  const m = String(model);
  if (isOpenCodeGoModel(m)) {
    console.warn(`[路由] OpenCode Go 已停用: ${m} → ${GLM_CN_PRIMARY}`);
    return GLM_CN_PRIMARY;
  }
  return m;
}

/** 用户偏好入库前清洗 */
export function sanitizePreferredModel(model) {
  if (!model || model === 'auto') return null;
  if (isOpenCodeGoModel(model)) return null;
  if (model === 'cu/kimi-k2.5') return 'kimi/kimi-k2.7';
  return model;
}

/** Lume/设备侧 chat.send 使用的模型（避免设备 9Router 落到 ocg） */
export function resolveLumeModel(preferredModel) {
  const m = preferredModel || 'auto';
  if (isOpenCodeGoModel(m)) {
    return 'auto';
  }
  if (m === 'auto' || m === 'lume/auto') {
    return 'auto';
  }
  if (m.startsWith('cu/') || m.startsWith('gh/') || m.startsWith('glm-cn/') || m.startsWith('openrouter/') || m.startsWith('kimi/')) {
    return m;
  }
  return sanitizeRouterModel(m);
}

/** 启动时迁移 db.json 里残留的 ocg / 旧 Kimi 偏好 */
export function migrateOpenCodeGoPreferences(db) {
  if (!db?.users?.length) return false;
  let changed = false;
  for (const user of db.users) {
    if (user.preferredModel && isOpenCodeGoModel(user.preferredModel)) {
      console.warn(`[模型迁移] 用户 ${user.nickname || user.id}: ${user.preferredModel} → auto`);
      user.preferredModel = null;
      changed = true;
    }
    if (user.preferredModel === 'cu/kimi-k2.5') {
      console.warn(`[模型迁移] 用户 ${user.nickname || user.id}: cu/kimi-k2.5 → kimi/kimi-k2.7`);
      user.preferredModel = 'kimi/kimi-k2.7';
      changed = true;
    }
  }
  return changed;
}
