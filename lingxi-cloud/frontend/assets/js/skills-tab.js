/**
 * Lume Skills Library — Redesigned
 * Unified with lume.css design system, no emoji, lucide icons
 */

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
function switchView(view) {
  const chatContainer = document.querySelector('.chat-container');
  const skillsView = document.getElementById('skillsView');
  const serversView = document.getElementById('serversView');
  const workspaceView = document.getElementById('workspaceView');

  if (chatContainer) chatContainer.classList.remove('hidden');
  if (chatContainer) chatContainer.style.display = '';
  if (skillsView) skillsView.classList.remove('active');
  if (serversView) serversView.classList.remove('active');
  if (workspaceView) workspaceView.classList.remove('active');

  if (view === 'chat') {
    // default
  } else if (view === 'skills') {
    if (chatContainer) chatContainer.classList.add('hidden');
    if (skillsView) skillsView.classList.add('active');
    if (!skillsState.loaded) loadSkillsLibrary();
  } else if (view === 'servers') {
    if (chatContainer) chatContainer.classList.add('hidden');
    if (serversView) serversView.classList.add('active');
    loadServersView();
  } else if (view === 'workspace') {
    if (chatContainer) chatContainer.classList.add('hidden');
    if (workspaceView) workspaceView.classList.add('active');
  }
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

  // Build message: skill name + example
  let msg = '';
  if (example) {
    msg = `使用技能[${skillName}] ${example}`;
  } else {
    msg = `使用技能[${skillName}]`;
  }

  // Switch to chat view and fill input
  switchView('chat');
  setTimeout(() => {
    const input = document.getElementById('inputField');
    if (input) {
      input.value = msg;
      input.focus();
      // Auto-resize
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 150) + 'px';
      // Show send button
      const sendBtn = document.getElementById('sendBtn');
      if (sendBtn) sendBtn.classList.remove('hidden');
    }
  }, 150);
}

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

async function loadServersView() {
  const container = document.getElementById('serversGridContainer');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><div class="spinner" style="width:24px;height:24px"></div><div>Loading...</div></div>';
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  if (!token || !userId) { container.innerHTML = '<div class="empty-state"><div class="title">Please sign in</div></div>'; return; }

  try {
    const res = await fetch(`${API_BASE}/api/servers/${userId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    _serversCache.servers = data.servers || [];
    _serversCache.activeServerId = data.activeServerId || null;

    if (!_serversCache.servers.length) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="monitor" style="width:40px;height:40px;color:var(--text-3)"></i><div class="title">No devices yet</div><div class="desc">Add your OpenClaw server to get started</div></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = '<div style="display:grid;gap:12px">' + _serversCache.servers.map(s => {
      const isActive = s.id == _serversCache.activeServerId;
      const status = s.status || 'pending';
      const statusMap = { running: { text: 'Online', color: '#43e97b' }, offline: { text: 'Offline', color: '#999' }, pending: { text: 'Checking', color: '#fbbf24' }, unhealthy: { text: 'Unhealthy', color: '#fb923c' } };
      const si = statusMap[status] || statusMap.pending;
      return '<div class="card' + (isActive ? ' active' : '') + '" style="' + (isActive ? 'border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-ring);' : '') + '"><div class="flex items-center gap-3 mb-2"><div style="width:10px;height:10px;border-radius:50%;background:' + si.color + ';' + (status === 'running' ? 'box-shadow:0 0 6px ' + si.color + ';' : '') + '"></div><span class="font-semibold">' + (s.name || 'Unnamed') + '</span>' + (isActive ? ' <span class="badge badge-green" style="font-size:10px">Active</span>' : '') + '<span class="text-xs" style="color:var(--text-3);margin-left:auto">' + si.text + '</span></div><div class="text-xs" style="color:var(--text-3);font-family:monospace">' + s.ip + ':' + (s.openclawPort || 18789) + '</div>' + (s.description ? '<div class="text-xs mt-1" style="color:var(--text-3)">' + s.description + '</div>' : '') + '<div style="border-top:1px solid var(--border-sub);margin-top:10px;padding-top:10px;display:flex;flex-wrap:wrap;gap:6px"><button class="btn btn-sm btn-ghost" onclick="checkServer(\'' + s.id + '\')">Check</button>' + (!isActive ? '<button class="btn btn-sm btn-primary" onclick="activateServer(\'' + s.id + '\')">Switch</button>' : '') + '<button class="btn btn-sm btn-ghost" onclick="showEditServerModal(\'' + s.id + '\')">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteServer(\'' + s.id + '\')">Delete</button></div></div>';
    }).join('') + '</div>';
    if (window.lucide) lucide.createIcons();
  } catch(e) { container.innerHTML = '<div class="empty-state"><div class="title" style="color:#ef4444">Load failed: ' + e.message + '</div></div>'; }
}

// Server form functions
let _editingServerId = null;
function showAddServerModal() { _editingServerId = null; const m = document.getElementById('serverFormModal'); if(!m)return; document.getElementById('serverFormTitle').textContent='Add Device'; document.getElementById('serverFormSubmitBtn').textContent='Add'; ['sf_name','sf_ip','sf_token','sf_session','sf_desc'].forEach(id=>document.getElementById(id).value=''); document.getElementById('sf_port').value='18789'; m.style.display='flex'; }
function showEditServerModal(id) { const s = _serversCache.servers.find(x=>x.id==id); if(!s)return; _editingServerId=id; document.getElementById('serverFormTitle').textContent='Edit Device'; document.getElementById('serverFormSubmitBtn').textContent='Update'; document.getElementById('sf_name').value=s.name||''; document.getElementById('sf_ip').value=s.ip||''; document.getElementById('sf_port').value=s.openclawPort||18789; document.getElementById('sf_token').value=s.openclawToken||''; document.getElementById('sf_session').value=s.openclawSession||''; document.getElementById('sf_desc').value=s.description||''; document.getElementById('serverFormModal').style.display='flex'; }
function closeServerFormModal() { const m=document.getElementById('serverFormModal'); if(m)m.style.display='none'; }

async function submitServerForm() {
  const ip=document.getElementById('sf_ip').value.trim(); if(!ip){alert('IP required');return;}
  const body={name:document.getElementById('sf_name').value.trim(),ip,openclawPort:parseInt(document.getElementById('sf_port').value.trim())||18789,openclawToken:document.getElementById('sf_token').value.trim(),openclawSession:document.getElementById('sf_session').value.trim(),description:document.getElementById('sf_desc').value.trim()};
  const token=localStorage.getItem('lingxi_token'), userId=_getUserId();
  try{ const res=_editingServerId?await fetch(`${API_BASE}/api/servers/${userId}/${_editingServerId}`,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(body)}):await fetch(`${API_BASE}/api/servers/${userId}`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(body)}); closeServerFormModal(); loadServersView(); }catch(e){alert('Save failed: '+e.message);}
}

async function checkServer(id) { const token=localStorage.getItem('lingxi_token'),userId=_getUserId(); try{ const res=await fetch(`${API_BASE}/api/servers/${userId}/${id}/check`,{method:'POST',headers:{'Authorization':`Bearer ${token}`}}); const data=await res.json(); alert(data.status==='running'?'Online':'Offline'); loadServersView(); }catch(e){alert('Check failed');} }
async function activateServer(id) { const token=localStorage.getItem('lingxi_token'),userId=_getUserId(); try{ await fetch(`${API_BASE}/api/servers/${userId}/${id}/activate`,{method:'POST',headers:{'Authorization':`Bearer ${token}`}}); await loadServersView(); if(typeof reconnectAfterDeviceSwitch==='function')await reconnectAfterDeviceSwitch(); else location.reload(); }catch(e){alert('Switch failed');} }
async function deleteServer(id) { if(!confirm('Delete this device?'))return; const token=localStorage.getItem('lingxi_token'),userId=_getUserId(); try{ await fetch(`${API_BASE}/api/servers/${userId}/${id}`,{method:'DELETE',headers:{'Authorization':`Bearer ${token}`}}); loadServersView(); }catch(e){alert('Delete failed');} }

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
