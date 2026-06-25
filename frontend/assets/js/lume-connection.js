/**
 * Web 本机 / 云端连接 — Marvis 风格切换 + 记住上次选择
 */
const LumeConnection = (function () {
  const PREF_KEY = 'lume_connection_preference';
  const LOCAL_WS_DEFAULT = 'ws://127.0.0.1:18790';

  let routing = null;
  let activeTarget = null; // 'local' | 'cloud' | null
  let mounted = false;

  function isDesktopShell() {
    return document.documentElement.classList.contains('lume-desktop');
  }

  function getToken() {
    return localStorage.getItem('lingxi_token');
  }

  function getApiBase() {
    try {
      const u = JSON.parse(localStorage.getItem('lingxi_user') || '{}');
      if (u.serverUrl) return String(u.serverUrl).replace(/\/$/, '');
    } catch (_) {}
    return window.location.origin;
  }

  function getSavedPreference() {
    const desktop = localStorage.getItem('lume_desktop_connection_mode');
    if (desktop && ['auto', 'local', 'cloud'].includes(desktop)) return desktop;
    const web = localStorage.getItem(PREF_KEY);
    if (web && ['auto', 'local', 'cloud'].includes(web)) return web;
    return null;
  }

  function savePreference(mode) {
    try {
      localStorage.setItem(PREF_KEY, mode);
    } catch (_) {}
    if (!isDesktopShell()) {
      try {
        localStorage.setItem('lume_desktop_connection_mode', mode);
        if (mode === 'local' && routing?.localWsUrl) {
          localStorage.setItem('lume_desktop_ws_url', routing.localWsUrl);
          if (routing.localSecret) {
            localStorage.setItem('lume_desktop_lume_secret', routing.localSecret);
          }
          if (routing.userId) {
            localStorage.setItem('lume_desktop_user_id', routing.userId);
          }
        } else if (mode === 'cloud') {
          localStorage.removeItem('lume_desktop_ws_url');
        }
      } catch (_) {}
    }
  }

  async function fetchRouting() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(getApiBase() + '/api/lume/connect-info', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const json = await res.json();
      routing = json.data || null;
      return routing;
    } catch (e) {
      console.warn('[LumeConnection] connect-info failed', e);
      return null;
    }
  }

  function ensureDefaultPreference() {
    if (getSavedPreference()) return;
    const def = routing?.defaultConnectionMode || 'auto';
    savePreference(def);
  }

  function cloudAvailable() {
    return routing?.mode === 'lume' && (routing?.cloudWsUrl || routing?.wsUrl);
  }

  function targetLabel(target) {
    if (target === 'local') return '本机';
    if (target === 'cloud') return '云端';
    return '自动';
  }

  function statusHint() {
    if (typeof LumeRpc !== 'undefined' && LumeRpc.isConnected()) {
      const t = LumeRpc.getConnectionTarget();
      return t === 'local' ? '已连本机 OpenClaw' : '已连云端';
    }
    if (routing?.mode === 'free') {
      return '免费用户：在本机安装 OpenClaw 即可对话；云端需升级订阅';
    }
    if (!routing?.cloudServerRunning && !routing?.hasCloudServer) {
      return '新用户：本机安装 OpenClaw 即可开始';
    }
    if (routing?.cloudServerRunning) {
      return '已绑定云端，可切换本机或云端';
    }
    return '选择连接方式后开始对话';
  }

  function renderPicker() {
    const row = document.getElementById('connectionTargetRow');
    if (!row || isDesktopShell()) return;

    const pref = getSavedPreference() || routing?.defaultConnectionMode || 'auto';
    const connected =
      typeof LumeRpc !== 'undefined' && LumeRpc.isConnected();
    const effective = connected
      ? LumeRpc.getConnectionTarget() || activeTarget
      : activeTarget;

    row.hidden = false;
    row.innerHTML =
      '<div class="connection-target-head">' +
      '<span class="connection-target-label">连接至</span>' +
      '<span class="connection-target-status" id="connectionTargetStatus">' +
      (connected ? '● 已连接' : '○ 未连接') +
      '</span></div>' +
      '<div class="connection-target-pills" role="group" aria-label="连接目标">' +
      '<button type="button" class="connection-pill' +
      (pref === 'local' || effective === 'local' ? ' active' : '') +
      '" data-target="local">本机</button>' +
      '<button type="button" class="connection-pill' +
      (pref === 'cloud' || effective === 'cloud' ? ' active' : '') +
      '" data-target="cloud"' +
      (cloudAvailable() ? '' : ' disabled') +
      '>云端</button>' +
      '</div>' +
      '<p class="connection-target-hint" id="connectionTargetHint">' +
      statusHint() +
      '</p>';

    row.querySelectorAll('.connection-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        if (btn.disabled) return;
        void switchTarget(target);
      });
    });
  }

  async function switchTarget(target) {
    if (!target) return;
    if (target === 'cloud' && !cloudAvailable()) {
      if (typeof uiAlert === 'function') {
        await uiAlert('云端暂不可用。请升级订阅并确保云端服务器已启动，或改用本机。');
      }
      return;
    }

    savePreference(target);
    if (typeof LumeRpc !== 'undefined') {
      LumeRpc.disconnect();
      window.USE_LUME = false;
      const ok = await LumeRpc.reconnect();
      if (ok) {
        window.USE_LUME = true;
        if (typeof initLumeChatMode === 'function') initLumeChatMode();
        if (typeof loadLumeSessions === 'function') await loadLumeSessions();
      } else {
        if (typeof uiAlert === 'function') {
          await uiAlert(
            target === 'local'
              ? '本机 OpenClaw 未就绪。请确认已安装并启动 Lume 插件（端口 18790），或切换到云端。'
              : '云端连接失败，请稍后重试。',
          );
        }
      }
    }
    activeTarget = typeof LumeRpc !== 'undefined' ? LumeRpc.getConnectionTarget() : null;
    refreshUi();
  }

  function refreshUi() {
    if (!mounted) return;
    renderPicker();
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl && typeof LumeRpc !== 'undefined') {
      const dot = statusEl.querySelector('.status-dot');
      if (dot) {
        dot.className = LumeRpc.isConnected()
          ? 'status-dot connected'
          : 'status-dot disconnected';
      }
    }
  }

  async function init() {
    if (isDesktopShell()) return;
    mounted = true;
    await fetchRouting();
    ensureDefaultPreference();
    renderPicker();
  }

  async function afterConnect(target) {
    activeTarget = target;
    refreshUi();
  }

  return {
    init,
    refreshUi,
    fetchRouting,
    getRouting: () => routing,
    getSavedPreference,
    savePreference,
    switchTarget,
    afterConnect,
    isDesktopShell,
  };
})();
