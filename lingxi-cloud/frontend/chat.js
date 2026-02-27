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

// 当前已安装技能集合（用于快速查找）
let installedSkills = new Set();

// 当前筛选的 Agent
let currentSkillAgent = null;

// 搜索关键词
let skillSearchQuery = '';

// ===== 打开技能库弹窗 =====
function showSkillLibrary() {
  // 加载技能数据
  loadAvailableSkills();
  
  // 显示弹窗
  document.getElementById('skillLibraryModal').classList.add('show');
}

// ===== 加载可用技能和已安装技能 =====
async function loadAvailableSkills() {
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    alert('请先登录');
    return;
  }

  try {
    // 同时获取可用技能和已安装技能
    const [availableRes, installedRes] = await Promise.all([
      fetch(`${API_BASE}/api/skills/available`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      fetch(`${API_BASE}/api/skills/installed`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
    ]);

    if (!availableRes.ok || !installedRes.ok) {
      throw new Error('获取技能列表失败');
    }

    const availableData = await availableRes.json();
    const installedData = await installedRes.json();

    // 构建已安装技能集合（用于快速查找）
    installedSkills = new Set(installedData.skills.map(s => s.id));

    // 渲染技能列表
    renderSkills(availableData.skills, installedSkills);
    
    // 渲染 Agent 分类列表
    renderSkillAgentList(Object.keys(SKILL_AGENTS));

  } catch (error) {
    console.error('加载技能失败:', error);
    alert('获取技能列表失败: ' + error.message);
  }
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
                  onclick="installSkill('${skill.id}')">
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
  
  // 重新获取数据并过滤
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;
  
  fetch(`${API_BASE}/api/skills/available`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    renderSkills(data.skills, installedSkills);
  })
  .catch(err => {
    console.error('搜索失败:', err);
  });
}

// ===== 安装技能 =====
async function installSkill(skillId) {
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
  const btn = event.target;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="icon-sm"></i> 安装中...';
  
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
      const searchInput = document.getElementById('skillSearchInput');
      filterSkills(searchInput ? searchInput.value : '');
      
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
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ===== 关闭技能库弹窗 =====
function closeSkillLibrary() {
  document.getElementById('skillLibraryModal').classList.remove('show');
  
  // 重置状态
  currentSkillAgent = null;
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
  
  // 重新渲染技能列表
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;
  
  fetch(`${API_BASE}/api/skills/available`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    renderSkills(data.skills, installedSkills);
  })
  .catch(err => {
    console.error('切换 Agent 失败:', err);
  });
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
window.loadAvailableSkills = loadAvailableSkills;
window.renderSkills = renderSkills;
window.filterSkills = filterSkills;
window.installSkill = installSkill;
window.closeSkillLibrary = closeSkillLibrary;
window.switchSkillAgent = switchSkillAgent;

// 别名函数（用于 HTML oninput 事件）
function handleSkillSearch() {
  const input = document.getElementById('skillSearchInput');
  filterSkills(input ? input.value : '');
}
window.handleSkillSearch = handleSkillSearch;
