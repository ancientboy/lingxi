// Skill Library 功能

// Agent 分类配置（按顺序排列）
const SKILL_AGENTS = {
  coder: { name: '云溪', icon: 'code' },
  ops: { name: '若曦', icon: 'bar-chart-2' },
  inventor: { name: '紫萱', icon: 'lightbulb' },
  pm: { name: '梓萱', icon: 'target' },
  noter: { name: '晓琳', icon: 'file-text' },
  media: { name: '音韵', icon: 'palette' },
  smart: { name: '智家', icon: 'smart-home' },
  lingxi: { name: '灵犀', icon: 'zap' }
};

// 技能库 Tab 类型
const SKILL_TABS = ['local', 'clawhub', 'popular'];

// 当前已安装技能集合（用于快速查找）
let installedSkills = new Set();

// 当前筛选的 Agent
let currentSkillAgent = null;

// 当前 Tab
let currentSkillTab = 'local';

// 搜索关键词
let skillSearchQuery = '';

// 全网技能数据缓存
let clawhubSkillsCache = [];
let popularSkillsCache = [];

// ===== 打开技能库弹窗 =====
function showSkillLibrary() {
  // 加载技能数据
  loadSkillLibraryData();
  
  // 显示弹窗
  document.getElementById('skillLibraryModal').classList.add('show');
}

// ===== 加载技能库数据 =====
async function loadSkillLibraryData() {
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    alert('请先登录');
    return;
  }

  // 初始化缓存
  clawhubSkillsCache = [];
  popularSkillsCache = [];
  
  // 根据当前 Tab 加载数据
  await loadCurrentTabData();

  // 渲染 Agent 分类列表
  renderSkillAgentList(Object.keys(SKILL_AGENTS));
}

// ===== 根据当前 Tab 加载数据 =====
async function loadCurrentTabData() {
  const token = localStorage.getItem('lingxi_token');
  
  switch (currentSkillTab) {
    case 'local':
      await loadLocalSkills(token);
      break;
    case 'clawhub':
      await loadClawHubSkills(token);
      break;
    case 'popular':
      await loadPopularSkills(token);
      break;
  }
}

// ===== 加载本地技能 =====
async function loadLocalSkills(token) {
  try {
    // 同时获取可用技能和已安装技能（带用户隔离）
    const [availableRes, installedRes] = await Promise.all([
      fetch(`${API_BASE}/api/skills/available`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      fetch(`${API_BASE}/api/skills/installed`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
    ]);

    if (!availableRes.ok) {
      throw new Error('获取可用技能列表失败');
    }

    const availableData = await availableRes.json();

    // 如果用户已登录，获取已安装技能
    let installedSkillsSet = new Set();
    if (installedRes.ok) {
      const installedData = await installedRes.json();
      // 构建已安装技能集合（用于快速查找）
      installedSkillsSet = new Set(installedData.skills?.map(s => s.id) || []);
    }

    // 设置标题
    document.getElementById('skillGroupTitle').innerHTML = `
      <span style="color:#10a37f;font-weight:600;">
        <i data-lucide="database" class="icon-sm"></i> 本地技能
      </span>
      <span style="color:#6e6e80;font-size:12px;">(${availableData.total} 个技能)</span>
    `;

    // 渲染技能列表（使用正确的已安装集合）
    renderSkills(availableData.skills, installedSkillsSet);
    
    // 更新 Tab 状态
    updateTabStatus();
    
    // 更新全局 installedSkills
    installedSkills = installedSkillsSet;
    
  } catch (error) {
    console.error('加载本地技能失败:', error);
    renderEmptyState('无法加载本地技能，请重试');
  }
}

// ===== 加载全网技能 =====
async function loadClawHubSkills(token) {
  const query = skillSearchQuery || '';
  
  try {
    // 搜索或获取全部全网技能
    let apiUrl = query 
      ? `${API_BASE}/api/skills/clawhub/search?q=${encodeURIComponent(query)}`
      : `${API_BASE}/api/skills/clawhub/popular`;
    
    if (!query && clawhubSkillsCache.length > 0) {
      // 使用缓存
      clawhubSkillsCache.forEach(skill => {
        skill.source = 'clawhub';
        skill.installed = installedSkills.has(skill.id);
      });
      renderClawHubSkills(clawhubSkillsCache, query);
      updateTabStatus();
      return;
    }
    
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error('获取全网技能失败');
    }

    const data = await res.json();
    
    // 缓存技能数据
    if (!query && data.skills) {
      clawhubSkillsCache = data.skills;
    }

    // 设置标题
    const queryText = query ? ` "${query}"` : '';
    document.getElementById('skillGroupTitle').innerHTML = `
      <span style="color:#3b82f6;font-weight:600;">
        <i data-lucide="globe" class="icon-sm"></i> 全网技能${queryText}
      </span>
      <span style="color:#6e6e80;font-size:12px;">(${data.skills?.length || 0} 个技能)</span>
    `;

    // 渲染技能列表
    renderClawHubSkills(data.skills || [], query);
    
    // 更新 Tab 状态
    updateTabStatus();
    
  } catch (error) {
    console.error('加载全网技能失败:', error);
    renderEmptyState('无法加载全网技能，请检查网络连接');
  }
}

// ===== 加载热门技能 =====
async function loadPopularSkills(token) {
  const query = skillSearchQuery || '';
  
  try {
    // 搜索或获取全部热门技能
    let apiUrl = query 
      ? `${API_BASE}/api/skills/clawhub/search?q=${encodeURIComponent(query)}`
      : `${API_BASE}/api/skills/clawhub/popular`;
    
    if (!query && popularSkillsCache.length > 0) {
      // 使用缓存
      popularSkillsCache.forEach(skill => {
        skill.source = 'popular';
        skill.installed = installedSkills.has(skill.id);
      });
      renderPopularSkills(popularSkillsCache, query);
      updateTabStatus();
      return;
    }
    
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error('获取热门技能失败');
    }

    const data = await res.json();
    
    // 缓存技能数据
    if (!query && data.skills) {
      popularSkillsCache = data.skills;
    }

    // 设置标题
    const queryText = query ? ` "${query}"` : '';
    document.getElementById('skillGroupTitle').innerHTML = `
      <span style="color:#f59e0b;font-weight:600;">
        <i data-lucide="star" class="icon-sm"></i> 热门技能${queryText}
      </span>
      <span style="color:#6e6e80;font-size:12px;">(${data.skills?.length || 0} 个技能)</span>
    `;

    // 渲染技能列表
    renderPopularSkills(data.skills || [], query);
    
    // 更新 Tab 状态
    updateTabStatus();
    
  } catch (error) {
    console.error('加载热门技能失败:', error);
    renderEmptyState('无法加载热门技能，请重试');
  }
}

// ===== 渲染 ClawHub 技能列表 =====
function renderClawHubSkills(skills, query = '') {
  const container = document.getElementById('skillGrid');
  
  // 筛选技能（根据 Agent 和搜索关键词）
  const filteredSkills = skills.filter(skill => {
    // Agent 筛选
    if (currentSkillAgent && skill.agent !== SKILL_AGENTS[currentSkillAgent].name) {
      return false;
    }
    
    // 搜索筛选
    if (query) {
      const q = query.toLowerCase();
      return skill.name.toLowerCase().includes(q) || 
             skill.desc.toLowerCase().includes(q);
    }
    
    return true;
  });

  if (filteredSkills.length === 0) {
    renderEmptyState(query ? '未找到相关技能' : '暂无全网技能数据');
    return;
  }

  // 渲染技能卡片
  let cards = '';
  filteredSkills.forEach(skill => {
    const isInstalled = installedSkills.has(skill.id);
    
    // 获取 Agent ID 和图标
    const agentId = Object.keys(SKILL_AGENTS).find(
      k => SKILL_AGENTS[k].name === skill.agent
    ) || 'coder';
    
    const agentIcon = SKILL_AGENTS[agentId]?.icon || 'bot';
    
    // 渲染来源标签
    const sourceTag = skill.source === 'clawhub' 
      ? '<span class="skill-source-tag">ClawHub</span>'
      : skill.source === 'popular' 
        ? '<span class="skill-source-tag skill-source-hot">热门</span>'
        : '';
    
    // 渲染安装按钮
    let installBtn = '';
    if (!isInstalled) {
      installBtn = `
        <button class="skill-btn install" onclick="installGlobalSkill('${skill.id}', this)">
          安装
        </button>
      `;
    } else {
      installBtn = `
        <button class="skill-btn installed flat" disabled>
          <i data-lucide="check" class="icon-sm"></i>
          已安装
        </button>
      `;
    }
    
    cards += `
      <div class="skill-card">
        <div class="skill-header">
          <div class="skill-icon" style="background: ${getAgentGradient(agentId)}">
            <i data-lucide="${agentIcon}" class="icon-lg"></i>
          </div>
          <div class="skill-info">
            <div class="skill-name">${skill.name || skill.id}</div>
            <div class="skill-desc">${skill.desc}</div>
            <div class="skill-meta">
              <span class="skill-agent-tag">
                <i data-lucide="user" class="icon-sm"></i> ${skill.agent || '通用'}
              </span>
              ${sourceTag}
            </div>
          </div>
        </div>
        <div class="skill-actions">
          ${installBtn}
        </div>
      </div>
    `;
  });

  container.innerHTML = cards;
  
  // 初始化 Lucide 图标
  if (window.lucide) {
    lucide.createIcons();
  }
}

// ===== 渲染热门技能列表 =====
function renderPopularSkills(skills, query = '') {
  renderClawHubSkills(skills, query);
}

// ===== 渲染空状态 =====
function renderEmptyState(message) {
  const container = document.getElementById('skillGrid');
  container.innerHTML = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #9ca3af;">
      <i data-lucide="search" style="width:48px;height:48px;margin-bottom:12px;"></i>
      <p>${message}</p>
    </div>
  `;
  
  if (window.lucide) lucide.createIcons();
}

// ===== 更新 Tab 状态 =====
function updateTabStatus() {
  document.querySelectorAll('.skill-tab-item').forEach(item => {
    const tab = item.getAttribute('onclick')?.match(/switchSkillTab\('([^']+)'\)/);
    if (tab && tab[1] === currentSkillTab) {
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');
    } else {
      item.classList.remove('active');
      item.setAttribute('aria-selected', 'false');
    }
  });
}

// ===== 渲染 Agent 分类列表 =====
function renderSkillAgentList(agentKeys) {
  const container = document.getElementById('skillAgentList');
  
  // 云溪 Agent 专属：显示当前 Agent 类型（如果是云溪）
  const currentAgent = AGENT_INFO.coder ? 'coder' : null;
  
  let items = '';
  
  agentKeys.forEach(agentId => {
    const agent = SKILL_AGENTS[agentId];
    const isActive = currentSkillAgent === agentId;
    
    items += `
      <div class="skill-agent-item ${isActive ? 'active' : ''}" 
           onclick="switchSkillAgent('${agentId}')">
        <i data-lucide="${agent.icon}" class="icon"></i>
        <span>${agent.name}</span>
      </div>
    `;
  });
  
  container.innerHTML = items;
  
  // 初始化 Lucide 图标
  if (window.lucide) {
    lucide.createIcons();
  }
}

// ===== 渲染技能卡片网格 =====
function renderSkills(skills, installedSet) {
  const container = document.getElementById('skillGrid');
  
  // 筛选技能（根据 Agent 和搜索关键词）
  const filteredSkills = skills.filter(skill => {
    // Agent 筛选
    if (currentSkillAgent && skill.agent !== SKILL_AGENTS[currentSkillAgent].name) {
      return false;
    }
    
    // 搜索筛选
    if (skillSearchQuery) {
      const query = skillSearchQuery.toLowerCase();
      return skill.name.toLowerCase().includes(query) || 
             skill.desc.toLowerCase().includes(query);
    }
    
    return true;
  });

  if (filteredSkills.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #9ca3af;">
        <i data-lucide="search" style="width:48px;height:48px;margin-bottom:12px;"></i>
        <p>未找到相关技能</p>
      </div>
    `;
    
    if (window.lucide) lucide.createIcons();
    return;
  }

  // 渲染技能卡片
  let cards = '';
  filteredSkills.forEach(skill => {
    const isInstalled = installedSet.has(skill.id);
    
    // 将 Agent 名称转换为 Agent ID
    const agentId = Object.keys(SKILL_AGENTS).find(
      k => SKILL_AGENTS[k].name === skill.agent
    ) || 'coder';
    
    const agentIcon = SKILL_AGENTS[agentId]?.icon || 'bot';
    
    cards += `
      <div class="skill-card">
        <div class="skill-header">
          <div class="skill-icon" style="background: ${getAgentGradient(agentId)}">
            <i data-lucide="${agentIcon}" class="icon-lg"></i>
          </div>
          <div class="skill-info">
            <div class="skill-name">${skill.name || skill.id}</div>
            <div class="skill-desc">${skill.desc}</div>
            <span class="skill-agent-tag">
              <i data-lucide="user" class="icon-sm"></i> ${skill.agent || '通用'}
            </span>
          </div>
        </div>
        <div class="skill-actions">
          <button class="skill-btn ${isInstalled ? 'installed flat' : 'install'}" 
                  onclick="installSkill('${skill.id}', this)">
            ${isInstalled ? '已安装' : '安装'}
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = cards;
  
  // 初始化 Lucide 图标
  if (window.lucide) {
    lucide.createIcons();
  }
}

// ===== 搜索过滤 =====
function filterSkills(query) {
  skillSearchQuery = query.trim();
  
  // 重新加载当前 Tab 的数据
  loadCurrentTabData();
}

// ===== 切换 Tab =====
function switchSkillTab(tabName) {
  if (!SKILL_TABS.includes(tabName)) {
    console.error('无效的 Tab:', tabName);
    return;
  }
  
  // 如果切换到相同的 Tab，也重新加载数据（但不重置 Agent 筛选）
  const isSameTab = currentSkillTab === tabName;
  
  currentSkillTab = tabName;
  
  // 只有切换到不同 Tab 时才重置 Agent 筛选
  if (!isSameTab) {
    currentSkillAgent = null;
    document.querySelectorAll('.skill-agent-item.active').forEach(item => {
      item.classList.remove('active');
    });
  }
  
  // 更新 Tab UI 状态
  updateTabStatus();
  
  // 加载新 Tab 的数据（如果是相同 Tab，也会重新加载）
  loadCurrentTabData();
}

// ===== 安装技能 =====
async function installSkill(skillId, btn) {
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    alert('请先登录');
    return;
  }

  // 检查是否已安装
  if (installedSkills.has(skillId)) {
    alert('该技能已安装');
    return;
  }

  // 显示 loading
  const originalBtn = btn || event.target;
  const originalText = originalBtn.textContent;
  originalBtn.disabled = true;
  originalBtn.innerHTML = '<i data-lucide="loader" class="icon-sm"></i> 安装中...';
  
  if (window.lucide) lucide.createIcons();

  try {
    const res = await fetch(`${API_BASE}/api/skills/install/${skillId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (data.success || res.ok) {
      alert(data.message || `技能 ${skillId} 安装成功！`);
      
      // 更新已安装集合
      installedSkills.add(skillId);
      
      // 重新渲染技能列表（更新按钮状态）
      filterSkills(document.getElementById('skillSearchInput')?.value || '');
      
      // 刷新侧边栏技能统计（如果存在）
      if (typeof updateSkillStats === 'function') {
        updateSkillStats();
      }
    } else {
      alert(data.message || data.error || `技能 ${skillId} 安装失败`);
    }

  } catch (error) {
    console.error('安装失败:', error);
    alert('安装失败: ' + error.message);
  } finally {
    if (originalBtn) {
      originalBtn.disabled = false;
      originalBtn.textContent = originalText;
    }
  }
}

// ===== 安装全网技能 =====
async function installGlobalSkill(skillId, btn) {
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    alert('请先登录');
    return;
  }

  // 检查是否已安装
  if (installedSkills.has(skillId)) {
    alert('该技能已安装');
    return;
  }

  // 显示 loading
  const originalBtn = btn || event.target;
  const originalText = originalBtn.textContent;
  originalBtn.disabled = true;
  
  // 创建进度条容器
  const container = originalBtn.parentElement;
  const progressContainer = document.createElement('div');
  progressContainer.className = 'skill-progress-bar';
  progressContainer.innerHTML = '<div class="skill-progress-fill" style="width:0%"></div>';
  container.appendChild(progressContainer);
  
  originalBtn.innerHTML = '<i data-lucide="loader" class="icon-sm"></i> 下载中...';
  
  if (window.lucide) lucide.createIcons();

  try {
    const res = await fetch(`${API_BASE}/api/skills/install-global/${skillId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (data.success || data.alreadyInstalled) {
      alert(data.message || `技能 ${skillId} 安装成功！`);
      
      // 更新已安装集合
      installedSkills.add(skillId);
      
      // 移除进度条
      if (progressContainer) progressContainer.remove();
      
      // 重新渲染技能列表
      filterSkills(document.getElementById('skillSearchInput')?.value || '');
      
      // 刷新侧边栏技能统计（如果存在）
      if (typeof updateSkillStats === 'function') {
        updateSkillStats();
      }
    } else {
      // 移除进度条
      if (progressContainer) progressContainer.remove();
      
      alert(data.message || data.error || `技能 ${skillId} 安装失败`);
    }

  } catch (error) {
    console.error('安装失败:', error);
    alert('安装失败: ' + error.message);
    
    // 移除进度条
    if (progressContainer) progressContainer.remove();
  } finally {
    if (originalBtn) {
      originalBtn.disabled = false;
      originalBtn.textContent = originalText;
    }
  }
}

// ===== 关闭技能库弹窗 =====
function closeSkillLibrary() {
  document.getElementById('skillLibraryModal').classList.remove('show');
  
  // 重置状态
  currentSkillAgent = null;
  currentSkillTab = 'local';
  skillSearchQuery = '';
  document.getElementById('skillSearchInput').value = '';
}

// ===== 切换 Agent 分类 =====
function switchSkillAgent(agentId) {
  currentSkillAgent = agentId;
  
  // 更新 UI
  document.querySelectorAll('.skill-agent-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // 找到当前激活的项并添加 active 类
  const items = document.querySelectorAll('.skill-agent-item');
  items.forEach((item, index) => {
    // 简单匹配：通过 onclick 属性判断
    if (item.getAttribute('onclick')?.includes(agentId)) {
      item.classList.add('active');
    }
  });
  
  // 重新渲染技能列表（根据当前 Tab）
  loadCurrentTabData();
}

// ===== 获取 Agent 渐变色 =====
function getAgentGradient(agentId) {
  const gradients = {
    coder: 'linear-gradient(135deg, #10a37f 0%, #0d8a6a 100%)', // 绿色
    ops: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // 橙色
    inventor: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', // 紫色
    pm: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)', // 青色
    noter: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', // 红色
    media: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', // 粉色
    smart: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', // 蓝色
    lingxi: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' // 靛蓝色
  };
  
  return gradients[agentId] || gradients.coder;
}

// ===== 初始化 =====
// 在 chat.html 加载后初始化 Lucide 图标
if (window.lucide) {
  lucide.createIcons();
}

// 暴露函数到全局
window.showSkillLibrary = showSkillLibrary;
window.loadSkillLibraryData = loadSkillLibraryData;
window.loadLocalSkills = loadLocalSkills;
window.loadClawHubSkills = loadClawHubSkills;
window.loadPopularSkills = loadPopularSkills;
window.renderSkills = renderSkills;
window.renderClawHubSkills = renderClawHubSkills;
window.renderPopularSkills = renderPopularSkills;
window.renderEmptyState = renderEmptyState;
window.updateTabStatus = updateTabStatus;
window.filterSkills = filterSkills;
window.installSkill = installSkill;
window.installGlobalSkill = installGlobalSkill;
window.closeSkillLibrary = closeSkillLibrary;
window.switchSkillAgent = switchSkillAgent;
window.switchSkillTab = switchSkillTab;
window.handleSkillSearch = filterSkills;

// 暴露 Agent 渐变色函数
window.getAgentGradient = getAgentGradient;
