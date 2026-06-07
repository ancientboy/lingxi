// 技能库标签页逻辑

const SKILLS_AGENT_CONFIG = {
  coder: { name: '云溪', icon: '💻', color: 'linear-gradient(135deg, #10a37f, #14b8a6)' },
  ops: { name: '若曦', icon: '📊', color: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  inventor: { name: '紫萱', icon: '💡', color: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  pm: { name: '梓萱', icon: '🎯', color: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
  noter: { name: '晓琳', icon: '📝', color: 'linear-gradient(135deg, #fa709a, #fee140)' },
  media: { name: '音韵', icon: '🎨', color: 'linear-gradient(135deg, #30cfd0, #330867)' },
  smart: { name: '智家', icon: '🏠', color: 'linear-gradient(135deg, #a8edea, #fed6e3)' }
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

function switchView(view) {
  console.log('🔄 switchView 被调用, view:', view);
  
  const chatContainer = document.querySelector('.chat-container');
  const skillsView = document.getElementById('skillsView');
  const serversView = document.getElementById('serversView');
  const workspaceView = document.getElementById('workspaceView');
  
  // 隐藏所有视图
  if (chatContainer) chatContainer.classList.remove('hidden');
  if (chatContainer) chatContainer.style.display = '';
  if (skillsView) skillsView.classList.remove('active');
  if (serversView) serversView.classList.remove('active');
  if (workspaceView) workspaceView.classList.remove('active');
  
  if (view === 'chat') {
    // 聊天视图（默认）
  } else if (view === 'skills') {
    if (chatContainer) chatContainer.classList.add('hidden');
    if (skillsView) skillsView.classList.add('active');
    if (!skillsState.loaded) loadSkillsLibrary();
  } else if (view === 'servers') {
    if (chatContainer) chatContainer.classList.add('hidden');
    const serversView = document.getElementById('serversView');
    if (serversView) serversView.classList.add('active');
    loadServersView();
  } else if (view === 'workspace') {
    if (chatContainer) chatContainer.classList.add('hidden');
    const workspaceView = document.getElementById('workspaceView');
    if (workspaceView) workspaceView.classList.add('active');
  }
  
  // 强制重绘
  if (chatContainer) {
    void chatContainer.offsetHeight;
  }
  if (skillsView) {
    void skillsView.offsetHeight;
  }
}

async function loadSkillsLibrary() {
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    showToast('请先登录', 'error');
    return;
  }
  
  try {
    const res = await fetch('/api/skills/library', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      const data = await res.json();
      skillsState.allSkills = data.skills || [];
    }
    
    const res2 = await fetch('/api/skills/installed', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res2.ok) {
      const data2 = await res2.json();
      skillsState.installedSkillsData = data2.skills || [];
      const installedIds = skillsState.installedSkillsData.map(s => s.id || s);
      skillsState.installedSkills = new Set(installedIds);
    }
    
    renderCategories();
    renderSkills();
    bindSkillsEvents();
    skillsState.loaded = true;
  } catch (e) {
    console.error('加载失败:', e);
    showToast('加载失败: ' + e.message, 'error');
  }
}

async function loadBuiltinSkills() {
  const token = localStorage.getItem('lingxi_token');
  
  try {
    const res = await fetch('/api/skills/builtin', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (res.ok) {
      const data = await res.json();
      skillsState.builtinSkills = data.skills || [];
      renderCategories();
      renderSkills();
    }
  } catch (e) {
    console.error('加载官方技能失败:', e);
  }
}

function renderCategories() {
  const container = document.getElementById('skillsCategories');
  if (!container) return;
  
  const categories = [
    { id: 'all', name: '热门技能', icon: '🔥' },
    { id: 'builtin', name: '官方技能', icon: '⭐' },
    ...Object.entries(SKILLS_AGENT_CONFIG).map(([id, c]) => ({ id, name: c.name, icon: c.icon }))
  ];
  
  container.innerHTML = categories.map(cat => {
    let count = 0;
    if (cat.id === 'all') {
      count = skillsState.allSkills.length;
    } else if (cat.id === 'builtin') {
      count = skillsState.builtinSkills.length || 52;
    } else {
      count = skillsState.allSkills.filter(s => s.agent === cat.id).length;
    }
    
    const active = skillsState.currentCategory === cat.id ? 'active' : '';
    return '<button class="category-chip ' + active + '" data-category="' + cat.id + '">' +
      '<span class="category-icon">' + cat.icon + '</span>' +
      '<span>' + cat.name + '</span>' +
      '<span class="category-count">(' + count + ')</span>' +
    '</button>';
  }).join('');
}

function renderSkills() {
  const container = document.getElementById('skillsGrid');
  if (!container) return;
  
  let skills = [];
  
  if (skillsState.currentCategory === 'builtin') {
    skills = [...skillsState.builtinSkills];
  } else if (skillsState.currentCategory === 'all') {
    skills = [...skillsState.allSkills];
  } else {
    skills = skillsState.allSkills.filter(s => s.agent === skillsState.currentCategory);
  }
  
  if (skillsState.currentFilter === 'installed') {
    skills = skills.filter(s => skillsState.installedSkills.has(s.id));
  } else if (skillsState.currentFilter === 'new') {
    skills = skills.sort((a, b) => (b.version || '').localeCompare(a.version || ''));
  }
  
  const search = document.getElementById('skillsSearch')?.value?.toLowerCase() || '';
  if (search) {
    skills = skills.filter(s => 
      (s.name || '').toLowerCase().includes(search) ||
      (s.shortDesc || '').toLowerCase().includes(search)
    );
  }
  
  if (skills.length === 0) {
    const emptyMsg = skillsState.currentFilter === 'installed' 
      ? '该分类下暂无已安装的技能' 
      : '暂无技能';
    
    container.innerHTML = '<div class="skills-empty">' +
      '<div class="skills-empty-icon">📦</div>' +
      '<div>' + emptyMsg + '</div>' +
    '</div>';
    return;
  }
  
  container.innerHTML = skills.map(s => {
    const bg = SKILLS_AGENT_CONFIG[s.agent]?.color || '#10a37f';
    const cmd = s.installCommand || 'clawhub install ' + s.id;
    const installed = skillsState.installedSkills.has(s.id);
    const isBuiltin = s.builtin || skillsState.currentCategory === 'builtin';
    
    // 按钮文字和样式
    let btnHtml = '';
    if (isBuiltin) {
      btnHtml = '<span class="builtin-status">已安装 ✓</span>';
    } else if (installed) {
      btnHtml = '<span class="installed-status">已安装 ✓</span>';
    } else {
      btnHtml = '<button class="skill-install-btn" onclick="event.stopPropagation(); copySkillCmd(\'' + cmd + '\')">复制命令</button>';
    }
    
    // 详细内容
    let detailHtml = '';
    
    // 完整描述
    if (s.fullDesc && s.fullDesc !== s.shortDesc) {
      detailHtml += '<div class="skill-section"><div class="skill-section-title">📋 详细说明</div><div class="skill-section-content">' + s.fullDesc + '</div></div>';
    }
    
    // 功能特性
    if (s.features && s.features.length > 0) {
      detailHtml += '<div class="skill-section"><div class="skill-section-title">✨ 功能特性</div><div class="skill-features-list">' + 
        s.features.map(f => '<span class="feature-item">' + f + '</span>').join('') + 
      '</div></div>';
    }
    
    // 使用示例
    if (s.example) {
      detailHtml += '<div class="skill-section"><div class="skill-section-title">💡 使用示例</div><div class="skill-example">"' + s.example + '"</div></div>';
    }
    
    // 安装命令
    if (!isBuiltin) {
      detailHtml += '<div class="skill-section"><div class="skill-section-title">🔧 安装命令</div><div class="skill-cmd-box" onclick="copySkillCmd(\'' + cmd + '\')"><code>' + cmd + '</code><span class="copy-hint">点击复制</span></div></div>';
    }
    
    // 如果没有任何详细内容，显示简短描述
    if (!detailHtml) {
      detailHtml = '<div class="skill-section"><div class="skill-section-content">' + (s.shortDesc || '暂无详细说明') + '</div></div>';
    }
    
    return '<div class="skill-card' + (installed ? ' installed' : '') + '" data-skill="' + s.id + '">' +
      '<div class="skill-header">' +
        '<div class="skill-icon" style="background:' + bg + '">' + (s.icon || '📦') + '</div>' +
        '<div class="skill-info">' +
          '<div class="skill-name">' + (s.name || s.id) + '</div>' +
          '<div class="skill-desc">' + (s.shortDesc || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="skill-detail">' + detailHtml + '</div>' +
      '<div class="skill-footer">' +
        '<div class="skill-meta">' + 
          (isBuiltin ? '<span class="builtin-badge">⭐ 官方</span> ' : '') +
          'v' + (s.version || '1.0') + 
          (s.author ? ' · ' + s.author : '') +
        '</div>' +
        btnHtml +
      '</div>' +
    '</div>';
  }).join('');
}

function bindSkillsEvents() {
  const categoriesContainer = document.getElementById('skillsCategories');
  if (categoriesContainer) {
    categoriesContainer.addEventListener('click', e => {
      const chip = e.target.closest('.category-chip');
      if (chip) {
        skillsState.currentCategory = chip.dataset.category;
        
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        
        if (skillsState.currentCategory === 'builtin' && !skillsState.builtinLoaded) {
          loadBuiltinSkills();
          skillsState.builtinLoaded = true;
        }
        
        renderSkills();
      }
    });
  }
  
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      skillsState.currentFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderSkills();
    });
  });
  
  const searchInput = document.getElementById('skillsSearch');
  if (searchInput) {
    searchInput.addEventListener('input', renderSkills);
  }
  
  const grid = document.getElementById('skillsGrid');
  if (grid) {
    grid.addEventListener('click', e => {
      const card = e.target.closest('.skill-card');
      if (card && !e.target.closest('.skill-install-btn') && !e.target.closest('.skill-cmd-box')) {
        card.classList.toggle('expanded');
      }
    });
  }
}

function copySkillCmd(cmd) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cmd).then(() => {
      showToast('已复制: ' + cmd, 'success');
    }).catch(() => {
      fallbackCopy(cmd);
    });
  } else {
    fallbackCopy(cmd);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  
  try {
    const success = document.execCommand('copy');
    showToast(success ? '已复制: ' + text : '复制失败', success ? 'success' : 'error');
  } catch (e) {
    showToast('复制失败', 'error');
  }
  
  document.body.removeChild(textarea);
}

function showToast(msg, type) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 20px;background:' + 
    (type === 'success' ? '#10b981' : '#ef4444') + ';color:#fff;border-radius:8px;font-size:14px;z-index:9999;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

window.switchView = switchView;
window.copySkillCmd = copySkillCmd;

// 初始化视图状态
function initSkillsView() {
  // 检查是否需要自动切换视图
  const autoView = sessionStorage.getItem('autoSwitchView');
  if (autoView) {
    console.log('🔄 检测到自动切换视图请求，跳过初始化');
    return;
  }
  
  const chatContainer = document.querySelector('.chat-container');
  const skillsView = document.getElementById('skillsView');
  
  console.log('🔧 初始化视图状态');
  
  // 确保初始状态：聊天视图显示，技能库隐藏
  if (chatContainer) {
    chatContainer.classList.remove('hidden');
    console.log('✅ 初始：chatContainer 显示');
  }
  if (skillsView) {
    skillsView.classList.remove('active');
    console.log('✅ 初始：skillsView 隐藏');
  }
}

// 延迟初始化，避免与自动切换冲突
setTimeout(initSkillsView, 200);

console.log('✅ skills-tab.js 已加载');

window.initSkillsView = initSkillsView;

// ═══════════════════════════════════════════════════════════════
// 📱 设备管理视图
// ═══════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════
// 📱 设备管理（对标 Flutter servers_page.dart）
// ═══════════════════════════════════════════════════════════════

let _serversCache = { servers: [], activeServerId: null, userId: null };

function _getUserId() {
  if (_serversCache.userId) return _serversCache.userId;
  try {
    const u = JSON.parse(localStorage.getItem('lingxi_user') || '{}');
    _serversCache.userId = u.id || u.user?.id || '';
  } catch(e) { _serversCache.userId = ''; }
  return _serversCache.userId;
}

async function loadServersView() {
  const container = document.getElementById('serversGridContainer');
  if (!container) return;
  
  container.innerHTML = '<div style="text-align:center;color:#999;padding:60px 20px;"><div style="font-size:32px;margin-bottom:12px;">⏳</div>加载中...</div>';
  
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    container.innerHTML = '<div style="text-align:center;color:#999;padding:60px 20px;">请先登录</div>';
    return;
  }
  
  const userId = _getUserId();
  if (!userId) {
    container.innerHTML = '<div style="text-align:center;color:#999;padding:60px 20px;">获取用户信息失败</div>';
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/servers/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    _serversCache.servers = data.servers || [];
    _serversCache.activeServerId = data.activeServerId || null;
    
    if (_serversCache.servers.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:80px 20px;">
          <div style="width:64px;height:64px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
          <div style="font-size:16px;font-weight:500;color:#666;margin-bottom:8px;">还没有设备</div>
          <div style="color:#aaa;font-size:13px;margin-bottom:24px;">点击下方按钮添加你的 OpenClaw 服务器</div>
          <button onclick="showAddServerModal()" style="background:#10a37f;color:white;border:none;padding:12px 28px;border-radius:12px;font-size:14px;cursor:pointer;font-weight:500;">+ 添加设备</button>
        </div>`;
      return;
    }
    
    const servers = _serversCache.servers;
    const activeId = _serversCache.activeServerId;
    
    container.innerHTML = `
      <div style="display:grid;gap:12px;">
        ${servers.map(s => {
          const isActive = s.id == activeId;
          const status = s.status || 'pending';
          const statusInfo = {
            running: { text: '在线', color: '#43e97b', emoji: '●' },
            offline: { text: '离线', color: '#999', emoji: '●' },
            pending: { text: '检查中', color: '#fbbf24', emoji: '●' },
            unhealthy: { text: '异常', color: '#fb923c', emoji: '●' },
          };
          const si = statusInfo[status] || statusInfo.pending;
          const port = s.openclawPort || 18789;
          
          return `
            <div style="background:#fff;border-radius:12px;padding:16px;border:${isActive ? '2px solid #10a37f' : '1px solid #f0f0f0'};box-shadow:0 2px 8px rgba(0,0,0,0.04);">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:42px;height:42px;border-radius:10px;background:${isActive ? '#10a37f15' : '#f0eeff'};display:flex;align-items:center;justify-content:center;font-size:24px;color:${isActive ? '#10a37f' : '#ccc'};">●</div>
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:16px;font-weight:600;">${s.name || '未命名'}</span>
                    ${isActive ? '<span style="background:#10a37f;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">活跃</span>' : ''}
                  </div>
                  <div style="font-size:12px;color:#888;font-family:monospace;margin-top:2px;">${s.ip}:${port}</div>
                  ${s.description ? `<div style="font-size:11px;color:#aaa;margin-top:2px;">${s.description}</div>` : ''}
                </div>
                <div style="text-align:center;">
                  <div style="width:10px;height:10px;border-radius:50%;background:${si.color};margin:0 auto 4px;${status === 'running' ? 'box-shadow:0 0 6px ' + si.color + '60;' : ''}"></div>
                  <div style="font-size:11px;color:${si.color};font-weight:500;">${si.text}</div>
                </div>
              </div>
              <div style="border-top:1px solid #f5f5f5;margin-top:12px;padding-top:10px;display:flex;flex-wrap:wrap;gap:8px;">
                <button onclick="checkServer('${s.id}')" style="border:1px solid #ddd;background:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#667eea;">检查</button>
                ${!isActive ? `<button onclick="activateServer('${s.id}')" style="border:1px solid #10a37f50;background:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#10a37f;font-weight:600;">切换</button>` : ''}
                <button onclick="showEditServerModal('${s.id}')" style="border:1px solid #ddd;background:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#667eea;">编辑</button>
                <button onclick="deleteServer('${s.id}')" style="border:1px solid #f5576c50;background:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#f5576c;">删除</button>
              </div>
              ${s.lastCheck ? `<div style="font-size:10px;color:#bbb;margin-top:8px;">最后检查: ${new Date(s.lastCheck).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})} ${new Date(s.lastCheck).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;color:#e53935;padding:40px;">加载失败: ${e.message}</div>`;
  }
}

// ===== 添加设备弹框（对标 Flutter _showAddModal） =====
let _editingServerId = null;

function showAddServerModal() {
  _editingServerId = null;
  const modal = document.getElementById('serverFormModal');
  if (!modal) { console.error('❌ serverFormModal not found'); return; }
  document.getElementById('serverFormTitle').textContent = '添加设备';
  document.getElementById('serverFormSubmitBtn').textContent = '添加';
  document.getElementById('sf_name').value = '';
  document.getElementById('sf_ip').value = '';
  document.getElementById('sf_port').value = '18789';
  document.getElementById('sf_token').value = '';
  document.getElementById('sf_session').value = '';
  document.getElementById('sf_desc').value = '';
  modal.style.display = 'flex';
}

function showEditServerModal(serverId) {
  const server = _serversCache.servers.find(s => s.id == serverId);
  if (!server) return;
  
  _editingServerId = serverId;
  document.getElementById('serverFormTitle').textContent = '编辑设备';
  document.getElementById('serverFormSubmitBtn').textContent = '更新';
  document.getElementById('sf_name').value = server.name || '';
  document.getElementById('sf_ip').value = server.ip || '';
  document.getElementById('sf_port').value = server.openclawPort || 18789;
  document.getElementById('sf_token').value = server.openclawToken || '';
  document.getElementById('sf_session').value = server.openclawSession || '';
  document.getElementById('sf_desc').value = server.description || '';
  const modal = document.getElementById('serverFormModal');
  if (modal) modal.style.display = 'flex';
}

function closeServerFormModal() {
  const modal = document.getElementById('serverFormModal');
  if (modal) modal.style.display = 'none';
}

async function submitServerForm() {
  const ip = document.getElementById('sf_ip').value.trim();
  if (!ip) {
    alert('IP 地址必填');
    return;
  }
  
  const body = {
    name: document.getElementById('sf_name').value.trim(),
    ip: ip,
    openclawPort: parseInt(document.getElementById('sf_port').value.trim()) || 18789,
    openclawToken: document.getElementById('sf_token').value.trim(),
    openclawSession: document.getElementById('sf_session').value.trim(),
    description: document.getElementById('sf_desc').value.trim(),
  };
  
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  
  try {
    let res;
    if (_editingServerId) {
      res = await fetch(`${API_BASE}/api/servers/${userId}/${_editingServerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch(`${API_BASE}/api/servers/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
    }
    const data = await res.json();
    closeServerFormModal();
    loadServersView();
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

async function checkServer(serverId) {
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  try {
    const res = await fetch(`${API_BASE}/api/servers/${userId}/${serverId}/check`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    alert(data.status === 'running' ? '✅ 设备在线' : '❌ 设备离线');
    loadServersView();
  } catch (e) {
    alert('检查失败: ' + e.message);
  }
}

async function activateServer(serverId) {
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  try {
    await fetch(`${API_BASE}/api/servers/${userId}/${serverId}/activate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // 刷新设备列表
    await loadServersView();
    
    // 重连 WebSocket（跟 Flutter 的 ws.reset() + ws.connect() 一样）
    if (typeof reconnectAfterDeviceSwitch === 'function') {
      await reconnectAfterDeviceSwitch();
    } else {
      // fallback：刷新页面
      location.reload();
    }
  } catch (e) {
    alert('切换失败: ' + e.message);
  }
}

async function deleteServer(serverId) {
  if (!confirm('确定要删除这台设备吗？')) return;
  const token = localStorage.getItem('lingxi_token');
  const userId = _getUserId();
  try {
    await fetch(`${API_BASE}/api/servers/${userId}/${serverId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadServersView();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

window.loadServersView = loadServersView;
window.switchView = switchView;
window.showAddServerModal = showAddServerModal;
window.showEditServerModal = showEditServerModal;
window.closeServerFormModal = closeServerFormModal;
window.submitServerForm = submitServerForm;
window.checkServer = checkServer;
window.activateServer = activateServer;
window.deleteServer = deleteServer;
