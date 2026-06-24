/**
 * Lume Skills Library — Redesigned
 * Unified with lume.css design system, no emoji, lucide icons
 */

function uiAlert(message, options) {
  if (typeof showLumeAlert === 'function') return showLumeAlert(message, options);
  window.alert(message);
  return Promise.resolve(true);
}
function uiConfirm(message, options) {
  if (typeof showLumeConfirm === 'function') return showLumeConfirm(message, options);
  return Promise.resolve(window.confirm(message));
}

const SKILLS_AGENT_CONFIG = {
  coder: { name: 'Spark', icon: 'code', color: 'var(--accent)' },
  ops: { name: 'Pulse', icon: 'bar-chart-2', color: '#f59e0b' },
  inventor: { name: 'Nova', icon: 'lightbulb', color: '#8b5cf6' },
  pm: { name: 'Scope', icon: 'target', color: '#06b6d4' },
  noter: { name: 'Echo', icon: 'file-text', color: '#ef4444' },
  media: { name: 'Prism', icon: 'palette', color: '#ec4899' },
  smart: { name: 'Nest', icon: 'home', color: '#3b82f6' }
};

let skillsState = {
  allSkills: [],
  builtinSkills: [],
  installedSkills: new Set(),
  installedSkillsData: [],
  currentCategory: 'all',
  currentFilter: 'all',
  loaded: false,
  builtinLoaded: false
};

// ===== View Switching =====
const VIEW_IDS = ['skillsView', 'serversView', 'workspaceView', 'cronView', 'loopsView'];

function hideAllAppViews() {
  VIEW_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
}

function updateViewShortcuts(activeView) {
  window._currentAppView = activeView || null;
  const feOpen = document.getElementById('fileExplorerPanel')?.classList.contains('open');

  document.querySelectorAll('.right-sidebar-shortcut[data-nav]').forEach((btn) => {
    const nav = btn.dataset.nav;
    if (nav === 'files') {
      btn.classList.toggle('active', feOpen && !activeView);
    } else if (nav === 'notif') {
      btn.classList.remove('active');
    } else {
      btn.classList.toggle('active', nav === activeView);
    }
  });
}

function switchView(view) {
  const chatContainer = document.querySelector('.chat-container');
  const skillsView = document.getElementById('skillsView');
  const serversView = document.getElementById('serversView');
  const workspaceView = document.getElementById('workspaceView');
  const cronView = document.getElementById('cronView');
  const loopsView = document.getElementById('loopsView');

  hideAllAppViews();

  if (chatContainer) {
    chatContainer.classList.remove('hidden');
    chatContainer.style.display = '';
  }

  if (view === 'chat') {
    updateViewShortcuts(null);
    if (typeof updateRightSidebarToggleUi === 'function') updateRightSidebarToggleUi();
    return;
  }

  const fePanel = document.getElementById('fileExplorerPanel');
  if (fePanel?.classList.contains('open') && typeof toggleFileExplorer === 'function') {
    toggleFileExplorer();
  }

  if (chatContainer) chatContainer.classList.add('hidden');

  if (view === 'skills') {
    if (skillsView) skillsView.classList.add('active');
    if (!skillsState.loaded) loadSkillsLibrary();
  } else if (view === 'servers') {
    if (serversView) serversView.classList.add('active');
    loadServersView();
  } else if (view === 'workspace') {
    if (workspaceView) workspaceView.classList.add('active');
  } else if (view === 'cron') {
    if (cronView) cronView.classList.add('active');
    const cronIframe = document.getElementById('cronIframe');
    if (cronIframe) {
      const src = cronIframe.dataset.src || 'cron.html?embedded=1&v=20260624w';
      if (!cronIframe.src || cronIframe.src === 'about:blank' || cronIframe.src.endsWith('about:blank')) {
        cronIframe.src = src;
      }
    }
  } else if (view === 'loops') {
    if (loopsView) loopsView.classList.add('active');
  }

  updateViewShortcuts(view);
  if (typeof updateRightSidebarToggleUi === 'function') updateRightSidebarToggleUi();
}

// ===== Load Skills =====
async function loadSkillsLibrary() {
  const token = localStorage.getItem('lingxi_token');
  if (!token) { _showToast('Please sign in', 'error'); return; }

  try {
    const res = await fetch('/api/skills/library', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) { const data = await res.json(); skillsState.allSkills = data.skills || []; }

    const res2 = await fetch('/api/skills/installed', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res2.ok) {
      const data2 = await res2.json();
      skillsState.installedSkillsData = data2.skills || [];
      skillsState.installedSkills = new Set(skillsState.installedSkillsData.map(s => s.id || s));
    }

    renderCategories();
    renderSkills();
    bindSkillsEvents();
    skillsState.loaded = true;
  } catch (e) {
    console.error('Load skills failed:', e);
    _showToast('Failed to load skills', 'error');
  }
}

async function loadBuiltinSkills() {
  const token = localStorage.getItem('lingxi_token');
  try {
    const res = await fetch('/api/skills/builtin', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) { const data = await res.json(); skillsState.builtinSkills = data.skills || []; renderCategories(); renderSkills(); }
  } catch (e) { console.error('Load builtin failed:', e); }
}

// ===== Render Categories =====
function renderCategories() {
  const container = document.getElementById('skillsCategories');
  if (!container) return;

  const categories = [
    { id: 'all', name: 'Popular', icon: 'flame' },
    { id: 'builtin', name: 'Official', icon: 'badge-check' },
    ...Object.entries(SKILLS_AGENT_CONFIG).map(([id, c]) => ({ id, name: c.name, icon: c.icon }))
  ];

  container.innerHTML = categories.map(cat => {
    let count = 0;
    if (cat.id === 'all') count = skillsState.allSkills.length;
    else if (cat.id === 'builtin') count = skillsState.builtinSkills.length || 52;
    else count = skillsState.allSkills.filter(s => s.agent === cat.id).length;

    const active = skillsState.currentCategory === cat.id ? 'active' : '';
    return '<button class="category-chip ' + active + '" data-category="' + cat.id + '">' +
      '<i data-lucide="' + cat.icon + '" style="width:14px;height:14px"></i>' +
      '<span>' + cat.name + '</span>' +
      '<span class="category-count">(' + count + ')</span>' +
    '</button>';
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ===== Render Skills =====
function renderSkills() {
  const container = document.getElementById('skillsGrid');
  if (!container) return;

  let skills = [];
  if (skillsState.currentCategory === 'builtin') skills = [...skillsState.builtinSkills];
  else if (skillsState.currentCategory === 'all') skills = [...skillsState.allSkills];
  else skills = skillsState.allSkills.filter(s => s.agent === skillsState.currentCategory);

  if (skillsState.currentFilter === 'installed') skills = skills.filter(s => skillsState.installedSkills.has(s.id));
  else if (skillsState.currentFilter === 'new') skills = skills.sort((a, b) => (b.version || '').localeCompare(a.version || ''));

  const search = document.getElementById('skillsSearch')?.value?.toLowerCase() || '';
  if (search) skills = skills.filter(s => (s.name || '').toLowerCase().includes(search) || (s.shortDesc || '').toLowerCase().includes(search));

  if (skills.length === 0) {
    container.innerHTML = '<div class="skills-empty"><i data-lucide="package-open" style="width:40px;height:40px;color:var(--text-3)"></i><div>No skills found</div></div>';
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = skills.map(s => {
    const agentConfig = SKILLS_AGENT_CONFIG[s.agent];
    const agentColor = agentConfig?.color || 'var(--accent)';
    const cmd = s.installCommand || 'clawhub install ' + s.id;
    const installed = skillsState.installedSkills.has(s.id);
    const isBuiltin = s.builtin || skillsState.currentCategory === 'builtin';

    // Button
    let btnHtml = '';
    if (isBuiltin) {
      btnHtml = '<span class="skill-status-badge builtin"><i data-lucide="check" style="width:12px;height:12px"></i> Built-in</span>';
    } else if (installed) {
      btnHtml = '<span class="skill-status-badge installed"><i data-lucide="check-circle" style="width:12px;height:12px"></i> Installed</span>' +
        '<button class="skill-use-btn" data-skill-id="' + s.id + '">Use</button>';
    } else {
      btnHtml = '<button class="skill-install-btn" data-skill-id="' + s.id + '" data-skill-name="' + _escAttr(s.name || s.id) + '"><i data-lucide="download" style="width:12px;height:12px"></i> Install & Use</button>';
    }

    // Detail sections
    let detailHtml = '';
    if (s.fullDesc && s.fullDesc !== s.shortDesc) detailHtml += '<div class="skill-section"><div class="skill-section-title">Details</div><div class="skill-section-content">' + s.fullDesc + '</div></div>';
    if (s.features && s.features.length > 0) detailHtml += '<div class="skill-section"><div class="skill-section-title">Features</div><div class="skill-features-list">' + s.features.map(f => '<span class="feature-item">' + f + '</span>').join('') + '</div></div>';
    if (s.example) detailHtml += '<div class="skill-section"><div class="skill-section-title">Example</div><div class="skill-example">"' + s.example + '"</div></div>';
    if (!detailHtml) detailHtml = '<div class="skill-section"><div class="skill-section-content">' + (s.shortDesc || 'No description') + '</div></div>';

    return '<div class="skill-card' + (installed ? ' installed' : '') + '" data-skill="' + s.id + '">' +
      '<div class="skill-header">' +
        '<div class="skill-icon" style="background:' + agentColor + '"><i data-lucide="' + (agentConfig?.icon || 'package') + '" style="width:20px;height:20px;color:white"></i></div>' +
        '<div class="skill-info">' +
          '<div class="skill-name">' + (s.name || s.id) + '</div>' +
          '<div class="skill-desc">' + (s.shortDesc || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="skill-detail">' + detailHtml + '</div>' +
      '<div class="skill-footer">' +
        '<div class="skill-meta">' +
          (isBuiltin ? '<span class="builtin-badge"><i data-lucide="badge-check" style="width:12px;height:12px"></i> Official</span> ' : '') +
          'v' + (s.version || '1.0') + (s.author ? ' &middot; ' + s.author : '') +
        '</div>' +
        btnHtml +
      '</div>' +
    '</div>';
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ===== Skill Actions =====
function _escAttr(str) { return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function _useSkill(skillId) {
  const allSkills = [...skillsState.allSkills, ...skillsState.builtinSkills];
  const skill = allSkills.find(s => s.id === skillId);
  const skillName = skill?.name || skillId;
  const example = skill?.example || '';
  const agentConfig = skill?.agent ? SKILLS_AGENT_CONFIG[skill.agent] : null;
  const icon = agentConfig?.icon || 'package';

  // Switch to chat view
  switchView('chat');

  setTimeout(() => {
    // Add skill tag to input area
    _addSkillTag(skillId, skillName, icon);

    // Fill example text into input
    const input = document.getElementById('inputField');
    if (input && example) {
      input.value = example;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    }
    if (input) input.focus();
  }, 150);
}

// ===== Skill Tag Management =====
function _addSkillTag(skillId, skillName, icon) {
  const area = document.getElementById('skillTagsArea');
  if (!area) return;

  // Remove existing tag with same skillId
  const existing = area.querySelector(`[data-skill-id="${skillId}"]`);
  if (existing) existing.remove();

  const tag = document.createElement('span');
  tag.className = 'skill-tag';
  tag.dataset.skillId = skillId;
  tag.innerHTML = `<i data-lucide="${icon}"></i>${skillName}<button class="skill-tag-close" onclick="_removeSkillTag('${skillId}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;

  area.appendChild(tag);
  if (window.lucide) lucide.createIcons();

  // Show send button (tags count as content)
  _updateSendBtnVisibility();
}

function _removeSkillTag(skillId) {
  const area = document.getElementById('skillTagsArea');
  if (!area) return;
  const tag = area.querySelector(`[data-skill-id="${skillId}"]`);
  if (tag) tag.remove();
  _updateSendBtnVisibility();
}

function _updateSendBtnVisibility() {
  const input = document.getElementById('inputField');
  const area = document.getElementById('skillTagsArea');
  const sendBtn = document.getElementById('sendBtn');
  if (!sendBtn) return;
  
  const hasText = input && input.value.trim().length > 0;
  const hasTags = area && area.children.length > 0;
  
  if (hasText || hasTags) {
    sendBtn.classList.remove('hidden');
  } else {
    sendBtn.classList.add('hidden');
  }
}

function _getSkillTags() {
  const area = document.getElementById('skillTagsArea');
  if (!area) return [];
  return Array.from(area.querySelectorAll('.skill-tag')).map(tag => ({
    id: tag.dataset.skillId,
    name: tag.textContent.replace('×', '').trim()
  }));
}

function _clearSkillTags() {
  const area = document.getElementById('skillTagsArea');
  if (area) area.innerHTML = '';
}

window._addSkillTag = _addSkillTag;
window._removeSkillTag = _removeSkillTag;
window._getSkillTags = _getSkillTags;
window._clearSkillTags = _clearSkillTags;

async function _installAndUse(skillId, skillName, btn) {
  const originalHTML = btn?.innerHTML || '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Installing...'; }

  try {
    const token = localStorage.getItem('lingxi_token');
    const res = await fetch('/api/skills/install-and-use', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ skillId, skillName })
    });
    const data = await res.json();

    if (data.success) {
      skillsState.installedSkills.add(skillId);
      renderSkills();
      _showToast('Skill installed!', 'success');

      // Find example and fill chat
      const allSkills = [...skillsState.allSkills, ...skillsState.builtinSkills];
      const skill = allSkills.find(s => s.id === skillId);
      const example = skill?.example || skill?.shortDesc || '';
      setTimeout(() => { _useSkill(skillId, example); }, 300);
    } else {
      // Fallback: fill install command in chat
      switchView('chat');
      const input = document.getElementById('inputField');
      if (input) {
        input.value = 'clawhub install ' + skillId;
        input.focus();
        input.dispatchEvent(new Event('input'));
      }
      _showToast('Install via chat command', 'success');
    }
  } catch (e) {
    switchView('chat');
    const input = document.getElementById('inputField');
    if (input) {
      input.value = 'clawhub install ' + skillId;
      input.focus();
      input.dispatchEvent(new Event('input'));
    }
    _showToast('Network error', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
  }
}

function copySkillCmd(cmd) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cmd).then(() => _showToast('Copied: ' + cmd, 'success')).catch(() => _fallbackCopy(cmd));
  } else _fallbackCopy(cmd);
}

function _fallbackCopy(text) {
  const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
  try { _showToast(document.execCommand('copy') ? 'Copied' : 'Copy failed', 'success'); } catch(e) { _showToast('Copy failed', 'error'); }
  document.body.removeChild(ta);
}

function _showToast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.background = type === 'success' ? 'var(--accent)' : '#ef4444';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ===== Events =====
function bindSkillsEvents() {
  const cc = document.getElementById('skillsCategories');
  if (cc) cc.addEventListener('click', e => {
    const chip = e.target.closest('.category-chip');
    if (chip) {
      skillsState.currentCategory = chip.dataset.category;
      document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (skillsState.currentCategory === 'builtin' && !skillsState.builtinLoaded) { loadBuiltinSkills(); skillsState.builtinLoaded = true; }
      renderSkills();
    }
  });

  document.querySelectorAll('.filter-chip').forEach(chip => chip.addEventListener('click', () => {
    skillsState.currentFilter = chip.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderSkills();
  }));

  const si = document.getElementById('skillsSearch');
  if (si) si.addEventListener('input', renderSkills);

  const grid = document.getElementById('skillsGrid');
  if (grid) grid.addEventListener('click', e => {
    // Use button
    const useBtn = e.target.closest('.skill-use-btn');
    if (useBtn) { e.stopPropagation(); _useSkill(useBtn.dataset.skillId); return; }
    // Install button
    const installBtn = e.target.closest('.skill-install-btn');
    if (installBtn) { e.stopPropagation(); _installAndUse(installBtn.dataset.skillId, installBtn.dataset.skillName, installBtn); return; }
    // Card expand
    const card = e.target.closest('.skill-card');
    if (card && !e.target.closest('.skill-install-btn') && !e.target.closest('.skill-use-btn') && !e.target.closest('.skill-cmd-box')) card.classList.toggle('expanded');
  });
}

// ===== Server Management (kept inline for now) =====
let _serversCache = { servers: [], activeServerId: null, userId: null };

function _getUserId() {
  if (_serversCache.userId) return _serversCache.userId;
  try { const u = JSON.parse(localStorage.getItem('lingxi_user') || '{}'); _serversCache.userId = u.id || u.user?.id || ''; } catch(e) { _serversCache.userId = ''; }
  return _serversCache.userId;
}

function _escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadServersView() {
  const container = document.getElementById('serversGridContainer');
  if (!container) return;
  container.innerHTML = '<div class="devices-empty"><div class="spinner" style="width:24px;height:24px;margin:0 auto 12px"></div><div class="devices-empty-title">加载中...</div></div>';
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  if (!token || !userId) {
    container.innerHTML = '<div class="devices-empty"><div class="devices-empty-title">请先登录</div><div class="devices-empty-desc">登录后可管理你的 AI 设备</div></div>';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/servers/${userId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    _serversCache.servers = data.servers || [];
    _serversCache.activeServerId = data.activeServerId || null;

    if (!_serversCache.servers.length) {
      container.innerHTML = `
        <div class="devices-empty">
          <div class="devices-empty-icon"><i data-lucide="monitor-smartphone" style="width:48px;height:48px"></i></div>
          <div class="devices-empty-title">还没有设备</div>
          <div class="devices-empty-desc">添加 OpenClaw 服务器，连接你的 AI 团队</div>
          <button type="button" class="view-panel-btn view-panel-btn-primary" onclick="showAddServerModal()">
            <i data-lucide="plus" class="icon-xs"></i>
            <span>添加第一台设备</span>
          </button>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const statusMap = {
      running: { text: '在线', cls: 'running' },
      offline: { text: '离线', cls: 'offline' },
      pending: { text: '检测中', cls: 'pending' },
      unhealthy: { text: '异常', cls: 'unhealthy' },
    };

    container.innerHTML = '<div class="devices-grid">' + _serversCache.servers.map((s) => {
      const isActive = s.id == _serversCache.activeServerId;
      const status = s.status || 'pending';
      const si = statusMap[status] || statusMap.pending;
      const name = _escapeHtml(s.name || '未命名设备');
      const endpoint = _escapeHtml(`${s.ip}:${s.openclawPort || 18789}`);
      const desc = s.description ? `<div class="device-card-desc">${_escapeHtml(s.description)}</div>` : '';

      return `
        <article class="device-card${isActive ? ' is-active' : ''}">
          <div class="device-card-top">
            <div class="device-card-icon">
              <i data-lucide="${isActive ? 'check-circle-2' : 'server'}" class="icon-sm"></i>
            </div>
            <div class="device-card-main">
              <div class="device-card-title-row">
                <span class="device-card-name">${name}</span>
                ${isActive ? '<span class="device-card-badge">当前设备</span>' : ''}
              </div>
              <div class="device-card-endpoint">${endpoint}</div>
              ${desc}
            </div>
            <div class="device-card-status">
              <span class="device-status-dot ${si.cls}"></span>
              <span>${si.text}</span>
            </div>
          </div>
          <div class="device-card-actions">
            <button type="button" class="device-action-btn" onclick="checkServer('${s.id}')">检测</button>
            ${!isActive ? `<button type="button" class="device-action-btn device-action-btn-primary" onclick="activateServer('${s.id}')">切换</button>` : ''}
            <button type="button" class="device-action-btn" onclick="showEditServerModal('${s.id}')">编辑</button>
            <button type="button" class="device-action-btn device-action-btn-danger" onclick="deleteServer('${s.id}')">删除</button>
          </div>
        </article>`;
    }).join('') + '</div>';
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    container.innerHTML = `<div class="devices-empty"><div class="devices-empty-title" style="color:#dc2626">加载失败</div><div class="devices-empty-desc">${_escapeHtml(e.message)}</div></div>`;
  }
}

// Server form functions
let _editingServerId = null;
function showAddServerModal() {
  _editingServerId = null;
  const m = document.getElementById('serverFormModal');
  if (!m) return;
  document.getElementById('serverFormTitle').textContent = '添加设备';
  document.getElementById('serverFormSubmitBtn').textContent = '添加';
  ['sf_name', 'sf_ip', 'sf_token', 'sf_session', 'sf_desc'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('sf_port').value = '18789';
  m.classList.add('show');
}
function showEditServerModal(id) {
  const s = _serversCache.servers.find((x) => x.id == id);
  if (!s) return;
  _editingServerId = id;
  document.getElementById('serverFormTitle').textContent = '编辑设备';
  document.getElementById('serverFormSubmitBtn').textContent = '保存';
  document.getElementById('sf_name').value = s.name || '';
  document.getElementById('sf_ip').value = s.ip || '';
  document.getElementById('sf_port').value = s.openclawPort || 18789;
  document.getElementById('sf_token').value = s.openclawToken || '';
  document.getElementById('sf_session').value = s.openclawSession || '';
  document.getElementById('sf_desc').value = s.description || '';
  document.getElementById('serverFormModal').classList.add('show');
}
function closeServerFormModal() {
  const m = document.getElementById('serverFormModal');
  if (m) m.classList.remove('show');
}

async function submitServerForm() {
  const ip = document.getElementById('sf_ip').value.trim();
  if (!ip) {
    await uiAlert('请填写设备 IP 地址', { title: '缺少信息' });
    return;
  }
  const body = {
    name: document.getElementById('sf_name').value.trim(),
    ip,
    openclawPort: parseInt(document.getElementById('sf_port').value.trim()) || 18789,
    openclawToken: document.getElementById('sf_token').value.trim(),
    openclawSession: document.getElementById('sf_session').value.trim(),
    description: document.getElementById('sf_desc').value.trim(),
  };
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  try {
    const res = _editingServerId
      ? await fetch(`${API_BASE}/api/servers/${userId}/${_editingServerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body) })
      : await fetch(`${API_BASE}/api/servers/${userId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body) });
    closeServerFormModal();
    loadServersView();
    if (typeof showLumeToast === 'function') showLumeToast('设备已保存', 'success');
  } catch (e) {
    await uiAlert('保存失败：' + e.message, { title: '保存失败' });
  }
}

async function checkServer(id) {
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  try {
    const res = await fetch(`${API_BASE}/api/servers/${userId}/${id}/check`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const online = data.status === 'running';
    if (typeof showLumeToast === 'function') {
      showLumeToast(online ? '设备在线' : '设备离线', online ? 'success' : 'info');
    } else {
      await uiAlert(online ? '设备在线' : '设备离线');
    }
    loadServersView();
  } catch (e) {
    await uiAlert('检测失败，请稍后重试', { title: '连接检测' });
  }
}

async function activateServer(id) {
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  try {
    await fetch(`${API_BASE}/api/servers/${userId}/${id}/activate`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    await loadServersView();
    if (typeof reconnectAfterDeviceSwitch === 'function') await reconnectAfterDeviceSwitch();
    else location.reload();
  } catch (e) {
    await uiAlert('切换设备失败，请稍后重试', { title: '切换失败' });
  }
}

async function deleteServer(id) {
  const server = _serversCache?.servers?.find(x => x.id === id);
  const label = server?.name || server?.ip || '该设备';
  if (!await uiConfirm(`将永久删除「${label}」，此操作无法恢复。`, {
    title: '删除设备',
    confirmText: '删除',
    cancelText: '取消',
    danger: true,
  })) return;
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  try {
    await fetch(`${API_BASE}/api/servers/${userId}/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    loadServersView();
    if (typeof showLumeToast === 'function') showLumeToast('设备已删除', 'success');
  } catch (e) {
    await uiAlert('删除失败，请稍后重试', { title: '删除失败' });
  }
}

// Init
function initSkillsView() {
  if (sessionStorage.getItem('autoSwitchView')) return;
  const cc = document.querySelector('.chat-container'), sv = document.getElementById('skillsView');
  if (cc) cc.classList.remove('hidden');
  if (sv) sv.classList.remove('active');
}
setTimeout(initSkillsView, 200);

// Expose to window
window.switchView = switchView;
window.copySkillCmd = copySkillCmd;
window.initSkillsView = initSkillsView;
window.loadServersView = loadServersView;
window.showAddServerModal = showAddServerModal;
window.showEditServerModal = showEditServerModal;
window.closeServerFormModal = closeServerFormModal;
window.submitServerForm = submitServerForm;
window.checkServer = checkServer;
window.activateServer = activateServer;
window.deleteServer = deleteServer;
window._useSkill = _useSkill;
window._installAndUse = _installAndUse;
