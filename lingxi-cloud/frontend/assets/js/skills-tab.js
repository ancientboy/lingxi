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
  const chatContainer = document.querySelector('.chat-container');
  const skillsView = document.getElementById('skillsView');
  
  if (view === 'chat') {
    if (chatContainer) chatContainer.classList.remove('hidden');
    if (skillsView) skillsView.classList.remove('active');
  } else if (view === 'skills') {
    if (chatContainer) chatContainer.classList.add('hidden');
    if (skillsView) skillsView.classList.add('active');
    
    if (!skillsState.loaded) {
      loadSkillsLibrary();
    }
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
      // 官方技能：不显示按钮，只显示绿色文字
      btnHtml = '<span class="builtin-status">已安装 ✓</span>';
    } else if (installed) {
      // 已安装的用户技能
      btnHtml = '<span class="installed-status">已安装 ✓</span>';
    } else {
      // 未安装的技能
      btnHtml = '<button class="skill-install-btn" onclick="event.stopPropagation(); copySkillCmd(\'' + cmd + '\')">复制命令</button>';
    }
    
    return '<div class="skill-card' + (installed ? ' installed' : '') + '" data-skill="' + s.id + '">' +
      '<div class="skill-header">' +
        '<div class="skill-icon" style="background:' + bg + '">' + (s.icon || '📦') + '</div>' +
        '<div class="skill-info">' +
          '<div class="skill-name">' + (s.name || s.id) + '</div>' +
          '<div class="skill-desc">' + (s.shortDesc || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="skill-detail">' + (s.fullDesc || s.shortDesc || '') + '</div>' +
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
      if (card && !e.target.closest('.skill-install-btn')) {
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

console.log('✅ skills-tab.js 已加载');
