/**
 * 灵犀云 - 聊天界面主脚本
 *
 * 总计: 2718 行，90 个函数
// 全局主题色（跟随 CSS 变量）
function _accent() { return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1a1a1a"; }
function _accentSoft() { return getComputedStyle(document.documentElement).getPropertyValue("--accent-soft").trim() || "rgba(0,0,0,0.08)"; }
 *
 * 模块索引:
 * ─────────────────────────────────────────
 * 📦 全局变量和配置         第 1-150 行
 * 🔌 WebSocket 模块         第 294-695 行
 * 💬 消息模块               第 483-1294 行
 * 📝 会话模块               第 695-1210 行
 * 👥 Agent 模块             第 1336-1509 行
 * ⚙️ 配置模块               第 1519-1760 行
 * 🎯 技能库模块             第 2148-2698 行
 * 引导模块               第 1803-1988 行
 * 🎨 UI 工具模块            第 143-1768 行
 * 📍 初始化入口             第 155-294 行
 * ─────────────────────────────────────────
 */

// 配置变量（从后端动态获取）
const API_BASE = window.location.origin;

// 统一弹窗（优先 Lume 自定义，fallback 原生）
function uiAlert(message, options) {
  if (typeof showLumeAlert === 'function') return showLumeAlert(message, options);
  window.alert(message);
  return Promise.resolve(true);
}
function uiConfirm(message, options) {
  if (typeof showLumeConfirm === 'function') return showLumeConfirm(message, options);
  return Promise.resolve(window.confirm(message));
}

let GATEWAY_WS = null;
let GATEWAY_TOKEN = null;  // JWT token，用于 WebSocket 代理认证
let OPENCLAW_TOKEN = null;  // OpenClaw token，用于 connect 消息
let GATEWAY_SESSION = null;
let SESSION_PREFIX = null;

let SESSION_KEY = null;  // 用户主会话（根据用户ID生成）
let currentSessionKey = null;  // 当前活动会话

// 监听设备切换事件（从 servers.html postMessage 发出）
window.addEventListener('message', (event) => {
  if (event.data?.type === 'device-switched') {
    console.log('🖥️ 检测到设备切换（postMessage），重新加载...');
    if (ws) { try { ws.onclose = null; ws.close(); } catch(e) {} }
    setTimeout(() => location.reload(), 300);
  }
});

// 跨 tab 监听 storage 变化
window.addEventListener('storage', (event) => {
  if (event.key === 'device_switched_at' && event.newValue) {
    console.log('🖥️ 检测到设备切换（storage），重新加载...');
    if (ws) { try { ws.onclose = null; ws.close(); } catch(e) {} }
    setTimeout(() => location.reload(), 300);
  }
});

// 🖥️ 同一 tab 返回时检测设备切换（pageshow/visibilitychange）
// 用户在同一 tab 中从 servers.html 返回时触发
// 用 sessionStorage 记录上次处理的切换时间（跨页面导航保留，但新 tab 不受影响）
let _lastDeviceSwitchHandled = sessionStorage.getItem('last_device_switch_handled') || '0';
// 页面加载时立即检查：如果 localStorage 里有未处理的设备切换，立即 reload
(function checkDeviceSwitchOnLoad() {
  const current = localStorage.getItem('device_switched_at') || '0';
  if (current !== _lastDeviceSwitchHandled) {
    console.log('🖥️ 检测到未处理的设备切换（页面加载），清理旧数据...');
    sessionStorage.setItem('last_device_switch_handled', current);
    _lastDeviceSwitchHandled = current;
    // 清理旧会话数据，让 init() 重新加载新设备的会话
    localStorage.removeItem('currentSessionKey');
    localStorage.removeItem('cached_sessions');
    localStorage.removeItem('chat_messages_cache');
  }
})();
window.addEventListener('pageshow', () => {
  const current = localStorage.getItem('device_switched_at') || '0';
  if (current !== _lastDeviceSwitchHandled) {
    _lastDeviceSwitchHandled = current;
    sessionStorage.setItem('last_device_switch_handled', current);
    console.log('🖥️ 检测到设备切换（pageshow），重新加载...');
    if (ws) { try { ws.onclose = null; ws.close(); } catch(e) {} }
    setTimeout(() => location.reload(), 300);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const current = localStorage.getItem('device_switched_at') || '0';
    if (current !== _lastDeviceSwitchHandled) {
      _lastDeviceSwitchHandled = current;
      sessionStorage.setItem('last_device_switch_handled', current);
      console.log('🖥️ 检测到设备切换（visibilitychange），重新加载...');
      if (ws) { try { ws.onclose = null; ws.close(); } catch(e) {} }
      setTimeout(() => location.reload(), 300);
    }
  }
});

const AGENT_INFO = {
  lingxi: {
    icon: 'zap',
    name: '灵犀',
    desc: '智能调度 · 日程管理',
    scene: '日程管理',
    skills: '任务规划、提醒、邮件',
    agentId: 'main',  // OpenClaw 内部的 agent ID
    examples: [
      { text: '帮我安排明天的日程', desc: '日程规划' },
      { text: '提醒我下午3点开会', desc: '设置提醒' },
      { text: '帮我起草一封工作邮件', desc: '邮件撰写' },
      { text: '这个任务应该派给谁？', desc: '智能调度' }
    ]
  },
  coder: {
    icon: 'code',
    name: '云溪',
    desc: '全栈开发 · 编程专家',
    scene: '编程开发',
    skills: '代码、调试、架构、API',
    agentId: 'coder',
    examples: [
      { text: '帮我写一个 Python 爬虫', desc: '代码生成' },
      { text: '这段代码有什么 bug？\n```python\nfor i in range(10)\n    print(i)\n```', desc: '代码审查' },
      { text: '设计一个用户登录 API', desc: 'API 设计' },
      { text: '优化这个 SQL 查询语句', desc: '性能优化' }
    ]
  },
  ops: {
    icon: 'bar-chart-2',
    name: '若曦',
    desc: '增长运营 · 数据专家',
    scene: '数据分析',
    skills: '报表、增长、SEO、用户研究',
    agentId: 'ops',
    examples: [
      { text: '分析一下这周的用户增长数据', desc: '数据分析' },
      { text: '给我一个 SEO 优化方案', desc: 'SEO 优化' },
      { text: '如何提高用户留存率？', desc: '增长策略' },
      { text: '分析竞品的优劣势', desc: '竞品分析' }
    ]
  },
  inventor: {
    icon: 'lightbulb',
    name: '紫萱',
    desc: '内容创意 · 文案总监',
    scene: '内容创作',
    skills: '文案、创意、社媒、营销',
    agentId: 'inventor',
    examples: [
      { text: '写一个产品宣传文案', desc: '文案创作' },
      { text: '给我的小红书账号想个选题', desc: '内容策划' },
      { text: '设计一个营销活动方案', desc: '活动策划' },
      { text: '头脑风暴：新产品的卖点', desc: '创意生成' }
    ]
  },
  pm: {
    icon: 'target',
    name: '梓萱',
    desc: '产品设计 · 需求专家',
    scene: '产品设计',
    skills: '需求、原型、UX、商业模式',
    agentId: 'pm',
    examples: [
      { text: '帮我写一个产品需求文档', desc: '需求分析' },
      { text: '设计一个用户注册流程', desc: '流程设计' },
      { text: '这个功能如何设计更好？', desc: '产品建议' },
      { text: '分析一下商业模式可行性', desc: '商业分析' }
    ]
  },
  noter: {
    icon: 'file-text',
    name: '晓琳',
    desc: '学习顾问 · 知识管理',
    scene: '知识管理',
    skills: '学习、翻译、笔记、搜索',
    agentId: 'noter',
    examples: [
      { text: '翻译这段话成英文', desc: '翻译服务' },
      { text: '帮我整理一下今天的会议笔记', desc: '笔记整理' },
      { text: '搜索一下 AI Agent 的最新进展', desc: '信息检索' },
      { text: '给我制定一个学习计划', desc: '学习规划' }
    ]
  },
  media: {
    icon: 'palette',
    name: '音韵',
    desc: '多媒体创作 · AI绘图',
    scene: '多媒体娱乐',
    skills: 'AI绘图、视频、音乐、剧本',
    agentId: 'media',
    examples: [
      { text: '生成一张科幻风格的封面图', desc: 'AI 绘图' },
      { text: '写一个短视频脚本', desc: '剧本创作' },
      { text: '给我推荐一些 BGM', desc: '音乐推荐' },
      { text: '设计一张海报', desc: '设计建议' }
    ]
  },
  smart: {
    icon: 'home',
    name: '智家',
    desc: '效率工具 · 自动化专家',
    scene: '智能工具',
    skills: '自动化、脚本、工具、效率',
    agentId: 'smart',
    examples: [
      { text: '写一个自动备份脚本', desc: '脚本编写' },
      { text: '如何批量重命名文件？', desc: '效率工具' },
      { text: '帮我设计一个自动化工作流', desc: '流程自动化' },
      { text: '推荐一些提高效率的工具', desc: '工具推荐' }
    ]
  },
  reviewer: {
    icon: 'search',
    name: '清源',
    desc: '代码审查 · 质量把关',
    scene: '代码审查',
    skills: '审查、安全、规范、质量',
    agentId: 'reviewer',
    examples: [
      { text: '审查这段代码有没有安全问题', desc: '安全审查' },
      { text: '检查是否符合编码规范', desc: '规范检查' },
      { text: '这段逻辑有什么潜在 bug？', desc: '逻辑审查' },
      { text: '评估这次改动的风险', desc: '风险评估' }
    ]
  },
  qa: {
    icon: 'check-circle',
    name: '知微',
    desc: '质量保证 · 测试专家',
    scene: '质量测试',
    skills: '测试、验证、回归、用例',
    agentId: 'qa',
    examples: [
      { text: '为这个功能设计测试用例', desc: '用例设计' },
      { text: '帮我做一次回归测试清单', desc: '回归测试' },
      { text: '这个接口如何验证正确性？', desc: '接口测试' },
      { text: '总结本次发布的测试要点', desc: '测试总结' }
    ]
  },
  auto: {
    icon: 'bot',
    name: 'Auto',
    desc: 'AI 助手',
    scene: '通用助手',
    skills: '对话、任务、自动化',
    agentId: 'auto',
    examples: [
      { text: '帮我处理这个任务', desc: '任务处理' },
      { text: '总结一下刚才的内容', desc: '内容总结' },
      { text: '有什么可以帮我的？', desc: '通用对话' }
    ]
  }
};

function resolveAgentInfo(agentId) {
  if (AGENT_INFO[agentId]) return { id: agentId, ...AGENT_INFO[agentId] };
  // 反向查找：通过 OpenClaw agentId（如 'main'）找到前端 key（如 'lingxi'）
  for (const [key, info] of Object.entries(AGENT_INFO)) {
    if (info.agentId === agentId) return { id: key, ...info };
  }
  const member = user?.team?.members?.find((m) => m.id === agentId);
  if (member) {
    return {
      id: agentId,
      icon: member.icon || 'bot',
      name: member.name || agentId,
      desc: member.desc || member.role || 'AI 助手',
      agentId: member.agentId || agentId,
      examples: [],
    };
  }
  return {
    id: agentId,
    icon: 'bot',
    name: agentId,
    desc: 'AI 助手',
    agentId: agentId,
    examples: [],
  };
}

// Agent 到技能的映射（用于技能库）
const AGENT_SKILLS_MAP = {
  lingxi: { name: '灵犀', desc: '智能调度 · 日程管理' },
  coder: { name: '云溪', desc: '全栈开发 · 编程专家' },
  ops: { name: '若曦', desc: '增长运营 · 数据专家' },
  inventor: { name: '紫萱', desc: '内容创意 · 文案总监' },
  pm: { name: '梓萱', desc: '产品设计 · 需求专家' },
  noter: { name: '晓琳', desc: '学习顾问 · 知识管理' },
  media: { name: '音韵', desc: '多媒体创作 · AI绘图' },
  smart: { name: '智家', desc: '效率工具 · 自动化专家' },
  reviewer: { name: '清源', desc: '代码审查 · 质量把关' },
  qa: { name: '知微', desc: '质量保证 · 测试专家' },
  auto: { name: 'Auto', desc: 'AI 助手' }
};

// 临时保存加载的技能数据
window.agentSkillsData = {};

// 辅助函数：生成 Lucide 图标 HTML

// ═══════════════════════════════════════════════════════════════
function agentIcon(agent, size = 'sm') {
  const icon = agent.icon || 'bot';
  const primaryClass = size === 'lg' ? '' : ' icon-primary';
  return `<i data-lucide="${icon}" class="icon icon-${size}${primaryClass}"></i>`;
}

function setSidebarCreditsDisplay(total) {
  const valueEl = document.getElementById('sidebarUserCreditsValue');
  const wrapEl = document.getElementById('sidebarUserCredits');
  const n = Number(total) || 0;
  const text = n.toLocaleString();
  if (valueEl) {
    valueEl.textContent = text;
  } else if (wrapEl) {
    wrapEl.textContent = text;
  }
  if (window.lucide) lucide.createIcons();
}

function setHomeMode(isHome) {
  const container = document.getElementById('chatContainer');
  const suggestions = document.getElementById('homeSuggestions');
  if (container) container.classList.toggle('is-home', isHome);
  if (suggestions && !isHome) {
    suggestions.innerHTML = '';
    suggestions.classList.add('hidden');
  }
  if (typeof updateScrollContextBar === 'function') updateScrollContextBar();
  if (!isHome) {
    requestAnimationFrame(() => {
      scrollChatToBottom(true);
    });
  }
}

// ===== 右侧团队抽屉 + Cursor 式滚动提问条 =====
function scrollChatToBottom(instant = false) {
  const scrollEl = document.getElementById('chatScroll');
  if (!scrollEl) return;
  scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
}

function getPlainUserText(content) {
  if (typeof content === 'string') return content.trim();
  if (content?.text && typeof content.text === 'string') return content.text.trim();
  return '';
}

function updateScrollContextBar() {
  const scrollEl = document.getElementById('chatScroll');
  const bar = document.getElementById('scrollContextBar');
  const textEl = document.getElementById('scrollContextText');
  const chatContainer = document.getElementById('chatContainer');
  if (!scrollEl || !bar || !textEl) return;

  const isHome = chatContainer?.classList.contains('is-home');
  const nearTop = scrollEl.scrollTop < 40;
  const nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 100;

  if (isHome || nearTop || nearBottom) {
    bar.classList.add('hidden');
    bar.setAttribute('aria-hidden', 'true');
    return;
  }

  const scrollRect = scrollEl.getBoundingClientRect();
  const threshold = scrollEl.scrollTop + 52;
  const userMsgs = scrollEl.querySelectorAll('.message.user');
  let label = '';

  userMsgs.forEach((msg) => {
    const msgTop = msg.getBoundingClientRect().top - scrollRect.top + scrollEl.scrollTop;
    if (msgTop <= threshold) {
      label = msg.dataset.userText || '';
    }
  });

  if (label) {
    textEl.textContent = label;
    bar.classList.remove('hidden');
    bar.setAttribute('aria-hidden', 'false');
  } else {
    bar.classList.add('hidden');
    bar.setAttribute('aria-hidden', 'true');
  }
}

function getTeamDrawerAgents() {
  if (user?.team?.members?.length) {
    return user.team.members.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      icon: m.icon || 'bot',
      desc: m.desc || m.role || 'AI 助手',
    }));
  }
  const ids = user?.agents?.length ? user.agents : ['lingxi'];
  return ids.map((id) => {
    const info = AGENT_INFO[id] || { name: id, icon: 'bot', desc: 'AI 助手' };
    return { id, name: info.name, icon: info.icon, desc: info.desc };
  });
}

function renderTeamDrawer() {
  const membersEl = document.getElementById('teamDrawerMembers');
  const skillsEl = document.getElementById('teamDrawerSkills');
  if (!membersEl) return;

  const agents = getTeamDrawerAgents();
  membersEl.innerHTML = agents.map((a) => `
    <button type="button" class="team-drawer-member${a.id === currentAgentId ? ' active' : ''}"
            onclick="switchAgentFromDrawer('${a.id}')">
      <div class="team-drawer-member-avatar">${agentIcon(a, 'sm')}</div>
      <div>
        <div class="team-drawer-member-name">${escapeHtml(a.name)}</div>
        <div class="team-drawer-member-role">${escapeHtml(a.desc || '')}</div>
      </div>
    </button>
  `).join('');

  const fullAgent = resolveAgentInfo(currentAgentId);
  const examples = (fullAgent.examples || []).slice(0, 4);
  if (skillsEl) {
    skillsEl.innerHTML = examples.length
      ? examples.map((ex) => `
        <button type="button" class="team-drawer-chip"
                onclick="sendFromTeamDrawer('${ex.text.replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">
          ${escapeHtml(ex.desc || ex.text.slice(0, 24))}
        </button>
      `).join('')
      : '<span class="team-drawer-empty">暂无快捷技能</span>';
  }

  if (window.lucide) lucide.createIcons();
}

function toggleTeamDrawer(forceOpen) {
  if (typeof forceOpen === 'boolean') {
    setRightSidebarCollapsed(!forceOpen);
    if (forceOpen) renderTeamDrawer();
    return;
  }
  toggleRightSidebar();
}

const RIGHT_SIDEBAR_COLLAPSED_KEY = 'lingxi_right_sidebar_collapsed';

function setRightSidebarCollapsed(collapsed) {
  const sidebar = document.getElementById('rightSidebar');
  const main = document.getElementById('mainContent');
  if (!sidebar) return;

  sidebar.classList.toggle('collapsed', collapsed);
  main?.classList.toggle('right-sidebar-collapsed', collapsed);
  document.body.classList.toggle('right-sidebar-expanded', !collapsed);

  if (window.innerWidth > 768) {
    localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }

  updateRightSidebarToggleUi();
}

function toggleRightSidebar() {
  const sidebar = document.getElementById('rightSidebar');
  if (!sidebar) return;
  const willCollapse = !sidebar.classList.contains('collapsed');
  setRightSidebarCollapsed(willCollapse);
  if (!willCollapse) renderTeamDrawer();
}

function updateRightSidebarToggleUi() {
  const sidebar = document.getElementById('rightSidebar');
  const expandBtn = document.getElementById('rightSidebarExpandBtn');
  const isMobile = window.innerWidth <= 768;
  const collapsed = sidebar?.classList.contains('collapsed');

  if (expandBtn) {
    expandBtn.hidden = isMobile || !collapsed;
  }

  if (typeof updateViewShortcuts === 'function') {
    updateViewShortcuts(window._currentAppView || null);
  }
}

function openFileExplorerFromNav() {
  if (window._currentAppView && typeof switchView === 'function') {
    switchView('chat');
  }
  const panel = document.getElementById('fileExplorerPanel');
  if (!panel?.classList.contains('open') && typeof toggleFileExplorer === 'function') {
    toggleFileExplorer();
  }
}

function initRightSidebar() {
  const sidebar = document.getElementById('rightSidebar');
  if (!sidebar) return;

  let collapsed = false;
  if (isMobileChatUi()) {
    collapsed = true;
  } else {
    collapsed = localStorage.getItem(RIGHT_SIDEBAR_COLLAPSED_KEY) === '1';
  }

  setRightSidebarCollapsed(collapsed);
  if (!collapsed) renderTeamDrawer();

  if (!window._rightSidebarResizeBound) {
    window._rightSidebarResizeBound = true;
    window.addEventListener('resize', () => {
      if (isMobileChatUi()) {
        setRightSidebarCollapsed(true);
      } else {
        updateRightSidebarToggleUi();
      }
    });
  }
}

function initTeamDrawer() {
  initRightSidebar();
}

function switchAgentFromDrawer(agentId) {
  if (agentId && typeof switchAgent === 'function') switchAgent(agentId);
}

function sendFromTeamDrawer(text) {
  if (typeof sendWelcomeExample === 'function') sendWelcomeExample(text);
}

function getWelcomeGreeting(agent) {
  const nick = user?.nickname || JSON.parse(localStorage.getItem('lingxi_user') || '{}').nickname;
  if (nick) return `你好，${nick}`;
  const name = agent?.name || '灵犀';
  if (name === '灵犀' || name === 'Lume' || agent?.id === 'lingxi') {
    return '我们先从哪里开始呢？';
  }
  return `与 ${name} 开始对话`;
}

function buildWelcomeExamplesHtml(examples) {
  return (examples || []).map((ex) => `
    <button type="button" class="home-chip" onclick="sendWelcomeExample('${ex.text.replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">
      <span class="home-chip-text">${ex.text}</span>
      ${ex.desc ? `<span class="home-chip-tag">${ex.desc}</span>` : ''}
    </button>
  `).join('');
}

function renderWelcomeHome(agentInfo) {
  const agent = agentInfo || AGENT_INFO[currentAgentId] || AGENT_INFO.lingxi;
  const container = document.getElementById('messages');
  const suggestionsEl = document.getElementById('homeSuggestions');
  if (!container) return;

  const sessionCount = (window.sessions || []).length;
  const mobileTip = isMobileChatUi() && sessionCount > 0
    ? `<p class="welcome-mobile-tip">点击左上角「历史」查看 ${sessionCount} 个对话，或直接在下方输入开始聊天</p>`
    : '';

  container.innerHTML = `
    <div class="welcome" id="welcome">
      <h1 class="welcome-title">${getWelcomeGreeting(agent)}</h1>
      <p class="welcome-desc">${agent.desc || '向灵犀或你的团队提问'}</p>
      ${mobileTip}
    </div>
  `;

  const examplesHtml = buildWelcomeExamplesHtml(agent.examples);
  if (suggestionsEl) {
    if (examplesHtml) {
      suggestionsEl.innerHTML = examplesHtml;
      suggestionsEl.classList.remove('hidden');
    } else {
      suggestionsEl.innerHTML = '';
      suggestionsEl.classList.add('hidden');
    }
  }

  setHomeMode(true);
  if (window.lucide) lucide.createIcons();
}

function hideWelcomeHome() {
  setHomeMode(false);
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.classList.add('hidden');
  requestAnimationFrame(() => {
    scrollChatToBottom(true);
    if (typeof updateScrollContextBar === 'function') updateScrollContextBar();
  });
}

const MOBILE_CHAT_BREAKPOINT = 1024;

function isMobileChatUi() {
  if (document.body?.classList.contains('force-mobile-chat-ui')) return true;
  if (window.matchMedia(`(max-width: ${MOBILE_CHAT_BREAKPOINT}px)`).matches) return true;
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  return coarse && window.innerWidth <= 1280;
}

function initMobileChatUi() {
  const apply = () => {
    const mobile = isMobileChatUi();
    document.body.classList.toggle('mobile-chat-ui', mobile);
    if (typeof updateSidebarToggleUi === 'function') updateSidebarToggleUi();
    if (typeof updateMobileSessionsState === 'function') updateMobileSessionsState();
  };
  apply();
  if (!window._mobileChatUiResizeBound) {
    window._mobileChatUiResizeBound = true;
    window.addEventListener('resize', apply);
  }
}

function updateMobileSessionsState() {
  const container = document.getElementById('chatContainer');
  const count = (window.sessions || []).length;
  if (container) container.classList.toggle('mobile-has-sessions', count > 0);
}

function getSessionCandidateKeys() {
  const sessions = window.sessions || [];
  const keys = [];
  const add = (k) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  add(localStorage.getItem('currentSessionKey'));
  add(window.currentSessionKey);
  add(currentSessionKey);
  sessions.forEach((s) => add(s.key));
  return keys;
}

function syncCurrentSessionKey(key) {
  currentSessionKey = key;
  window.currentSessionKey = key;
  try {
    if (key && typeof SESSION_PREFIX === 'string' && key.startsWith(SESSION_PREFIX)) {
      localStorage.setItem('currentSessionKey', key);
    }
  } catch (e) {
    console.warn('无法保存 currentSessionKey:', e);
  }
  if (typeof updateMobileChatHeader === 'function') updateMobileChatHeader();
}

let user = null;
let ws = null;
let pendingMessage = null;
let currentRunId = null;
let isGenerating = false;
let userServerInfo = null; // 用户服务器信息（IP、端口）

// 初始化

// ═══════════════════════════════════════════════════════════════
// 📍 初始化入口
// ═══════════════════════════════════════════════════════════════
async function init() {
  console.log('初始化聊天页面...');
  initMobileChatUi();

  // 清空消息区，确保每次初始化都是干净状态（防止设备切换后残留旧消息）
  const _msgContainer = document.getElementById('messages');
  if (_msgContainer) _msgContainer.innerHTML = '';

  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    console.log('没有 token，跳转到首页');
    window.location.href = 'index.html';
    return;
  }

  // 🖥️ 检测设备切换：如果从 servers.html 切换了设备回来，需要清理旧数据
  const _lastSwitchHandled = sessionStorage.getItem('last_device_switch_handled') || '0';
  const _currentSwitch = localStorage.getItem('device_switched_at') || '0';
  const _deviceSwitched = _currentSwitch !== _lastSwitchHandled;
  if (_deviceSwitched) {
    console.log('🖥️ 检测到设备切换，清理旧会话数据...');
    sessionStorage.setItem('last_device_switch_handled', _currentSwitch);
    localStorage.removeItem('currentSessionKey');  // 清除旧会话 key
    localStorage.removeItem('cached_sessions');     // 清除缓存的 session 列表
    localStorage.removeItem('chat_messages_cache'); // 清除消息缓存
    window.sessions = [];  // 清除内存中的旧会话列表
  }

  // 🔒 先从服务器获取最新用户信息并检查团队状态
  try {
    console.log('🔍 检查用户团队状态...');
    const meRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!meRes.ok) {
      console.log('获取用户信息失败，跳转首页');
      localStorage.removeItem('lingxi_token');
      window.location.href = 'index.html';
      return;
    }

    const userData = await meRes.json();
    user = userData;
    localStorage.setItem('lingxi_user', JSON.stringify(userData));

    console.log('👤 用户信息:', userData);

    // 更新用户订阅徽章
    if (typeof updateUserBadge === 'function') {
      updateUserBadge();
    }

    // 🔒 检查是否有团队（agents 不为空）
    if (!userData.agents || userData.agents.length === 0) {
      console.log('用户没有团队，跳转首页领取');
      await uiAlert('请先在首页领取 AI 团队');
      window.location.href = 'index.html';
      return;
    }

    console.log('用户已有团队:', userData.agents);

    // 刷新侧边栏积分（依赖 /api/user/credits）
    if (typeof refreshSidebarCredits === 'function') {
      refreshSidebarCredits();
    } else if (userData.points) {
      setSidebarCreditsDisplay(userData.points);
    }

  } catch (e) {
    console.error('检查团队失败:', e);
    window.location.href = 'index.html';
    return;
  }

  // 初始化用户专属会话
  if (!user.id) {
    console.error('用户 ID 不存在');
    await uiAlert('用户信息错误，请重新登录');
    window.location.href = 'index.html';
    return;
  }

  // 🔒 安全：从后端获取 Gateway 连接信息（不硬编码 token）
  try {
    console.log('📡 获取 Gateway 连接信息...');
    const res = await fetch(`${API_BASE}/api/gateway/connect-info`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('获取连接信息失败:', errorData);

      // 检查是否是服务器正在创建中
      if (errorData.needServer && errorData.status === 'creating') {
        await uiAlert('服务器正在创建中，请稍候...\n\n将返回首页等待创建完成。');
        window.location.href = 'index.html';
        return;
      }

      // 检查是否是需要服务器的错误
      if (errorData.needServer) {
        await uiAlert('您还没有专属服务器，请先在首页领取团队');
        window.location.href = 'index.html';
        return;
      }

      // 检查是否是 token 过期
      if (errorData.error === '登录已过期' || errorData.error === '未登录') {
        await uiAlert('登录已过期，请重新登录');
        localStorage.removeItem('lingxi_token');
        window.location.href = 'index.html';
        return;
      }

      // 其他错误
      await uiAlert(errorData.error || '获取连接信息失败');
      window.location.href = 'index.html';
      return;
    }

    const gatewayInfo = await res.json();
    GATEWAY_WS = gatewayInfo.wsUrl;
    GATEWAY_TOKEN = gatewayInfo.token;  // JWT token，用于代理
    OPENCLAW_TOKEN = gatewayInfo.gatewayToken;  // OpenClaw token，用于 connect
    GATEWAY_SESSION = gatewayInfo.session;
    SESSION_PREFIX = gatewayInfo.sessionPrefix;

    console.log('Gateway 配置已获取');

  } catch (e) {
    console.error('获取 Gateway 配置失败:', e);
    await uiAlert('网络错误，请刷新页面');
    return;
  }

  // 获取用户服务器信息（用于文件预览）
  try {
    console.log('📡 获取用户服务器信息...');
    const serverRes = await fetch(`${API_BASE}/api/user/server`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (serverRes.ok) {
      userServerInfo = await serverRes.json();
      console.log('服务器信息:', userServerInfo);
    } else {
      console.warn(' 无法获取服务器信息，文件预览可能不可用');
    }
  } catch (e) {
    console.warn(' 获取服务器信息失败:', e.message);
  }

  // 使用用户ID生成主会话key
  SESSION_KEY = SESSION_PREFIX;  // 格式：agent:main:user_xxx

  // 🆕 从 localStorage 恢复上次会话（如果存在）
  const savedSessionKey = localStorage.getItem('currentSessionKey');
  if (savedSessionKey && savedSessionKey.startsWith(SESSION_PREFIX)) {
    syncCurrentSessionKey(savedSessionKey);
    console.log('🔄 从 localStorage 恢复会话:', currentSessionKey);
  } else {
    syncCurrentSessionKey(SESSION_KEY);
    console.log('🔑 初始化主会话:', currentSessionKey);
  }

  renderTeamTags();

  const lumeOk = await tryConnectLume();
  if (lumeOk) {
    initLumeChatMode();
  } else {
    console.error('❌ [Lume] Web 连接失败，无法加载会话');
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
      statusDot = statusEl.querySelector('.status-dot');
      if (statusDot) statusDot.className = 'status-dot disconnected';
    }
  }

  let _isComposing = false;
  document.getElementById('inputField').addEventListener('compositionstart', () => { _isComposing = true; });
  document.getElementById('inputField').addEventListener('compositionend', () => { _isComposing = false; });
  document.getElementById('inputField').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !_isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });

  document.getElementById('inputField').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    // Update send button visibility
    if (typeof _updateSendBtnVisibility === 'function') _updateSendBtnVisibility();
  });

  // 初始化 agent 下拉（放在最后，确保 user 已加载）
  initAgentDropdown();

  // 加载通知未读数（异步，不阻塞初始化）
  loadNotificationUnreadCount();

  // 检查是否需要引导（放在初始化最后）
  await checkOnboarding();

  renderTeamDrawer();

  window.addEventListener('pageshow', (e) => {
    if (e.persisted && window.USE_LUME && typeof resolveInitialSession === 'function') {
      void resolveInitialSession();
    }
  });
}

let requestId = 1;
let statusDot = null;  // 状态指示器（由 Lume 模式设置）

// ════════════════════════════════════════════════════════════════
// 🔌 消息处理（Lume 事件由 chat-lume.js 中的 handleLumeEvent 处理）
// ════════════════════════════════════════════════════════════════

// 从消息对象中提取文本
function extractText(message) {
  if (!message) return '';
  if (typeof message === 'string') return cleanMessageText(message);
  if (message.text) return cleanMessageText(message.text);
  if (message.content) {
    if (typeof message.content === 'string') return cleanMessageText(message.content);
    if (Array.isArray(message.content)) {
      return message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
    }
  }
  return '';
}

// 清理消息文本，过滤掉元数据等技术信息
function cleanMessageText(text) {
  if (!text || typeof text !== 'string') return text;

  // 过滤掉 Conversation info (untrusted metadata) 等技术信息
  let cleaned = text;

  // 移除 Conversation info 块
  cleaned = cleaned.replace(/Conversation info \(untrusted metadata\):[\s\S]*?```/g, '');

  // 移除 ```json ... ``` 块中只包含元数据的内容
  cleaned = cleaned.replace(/```json\s*\{[\s\S]*?"message_id"[\s\S]*?\}\s*```/g, '');

  // 移除 [message_id: ...] 行
  cleaned = cleaned.replace(/\[message_id:\s*[a-f0-9-]+\]/gi, '');

  // 移除多余空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

// 流式消息管理
let streamingMessages = {};  // runId -> {element, text}

function renderBubbleActionsHtml() {
  return `
    <div class="bubble-actions" aria-label="消息操作">
      <button type="button" class="bubble-action-btn" onclick="copyBubble(this)" title="复制" aria-label="复制">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
    </div>
  `;
}

function updateLatestAssistantMessageActions() {
  const container = document.getElementById('messages');
  if (!container) return;
  container.querySelectorAll('.message.assistant.is-latest-assistant').forEach((el) => {
    el.classList.remove('is-latest-assistant');
  });
  const assistants = Array.from(container.querySelectorAll('.message.assistant')).filter(
    (el) => el.id !== 'typing-indicator'
  );
  const latest = assistants[assistants.length - 1];
  if (latest) latest.classList.add('is-latest-assistant');
}

// 更新或创建流式消息
function updateStreamingMessage(text, runId) {
  removeTyping();

  if (!streamingMessages[runId]) {
    // 创建新的流式消息
    const div = addMessage('assistant', text, '灵犀');
    streamingMessages[runId] = { element: div, text: text };
  } else {
    // 更新现有消息
    streamingMessages[runId].text = text;
    const bubble = streamingMessages[runId].element.querySelector('.bubble');
    if (bubble) {
      const { text: cleanText, filesHtml, imagesHtml } = processMessageFull(text, {});
      const renderedText = cleanText ? renderMarkdown(cleanText) : '';
      const metaEl = bubble.querySelector('.bubble-meta');
      const metaHtml = metaEl ? metaEl.outerHTML : '';
      bubble.innerHTML = `${renderedText}${imagesHtml}${filesHtml}${metaHtml}`;
    }
  }

  scrollChatToBottom(true);
}

// 检查是否有流式消息
function hasStreamingMessage(runId) {
  return !!streamingMessages[runId];
}

// 完成流式消息
function finalizeStreamingMessage(text, runId, modelInfo) {
  if (streamingMessages[runId] && text) {
    streamingMessages[runId].text = text;
    const bubble = streamingMessages[runId].element.querySelector('.bubble');
    if (bubble) {
      // 使用 processMessageFull 解析 Markdown 图片、音频和文件
      const fileOptions = userServerInfo ? {
        serverIp: userServerInfo.serverIp,
        serverPort: userServerInfo.fileServerPort || 9876,
        serverToken: userServerInfo.fileServerToken,
        userId: user?.id
      } : { userId: user?.id };
      const { text: cleanText, filesHtml, imagesHtml, audioHtml } = processMessageFull(text, fileOptions);
      const renderedText = cleanText ? renderMarkdown(cleanText) : '';
      const metaHtml = modelInfo ? renderBubbleMeta(modelInfo) : '';
      bubble.innerHTML = `${renderedText}${audioHtml}${imagesHtml}${filesHtml}${metaHtml}`;
    }
  }
  updateLatestAssistantMessageActions();
  // 清理
  delete streamingMessages[runId];
  const agentName = (typeof AGENT_INFO !== 'undefined' && AGENT_INFO[currentAgentId])
    ? AGENT_INFO[currentAgentId].name
    : '灵犀';
  lumeDesktopNotifyReply(text, agentName);
}

// 渲染团队标签
function renderTeamTags() {
  const agents = user?.agents || [];
  if (agents.length === 0) {
    agents.push('lingxi');
  }

  const tags = document.getElementById('teamTags');
  if (!tags) return;

  tags.innerHTML = `
    <div class="team-avatars">
      ${agents.map(id => {
        const agent = AGENT_INFO[id] || { icon: 'bot', name: id };
        return `<span class="team-avatar" title="${agent.name}">${agentIcon(agent)}</span>`;
      }).join('')}
    </div>
  `;
}

// 发送消息

// ═══════════════════════════════════════════════════════════════
// 💬 消息模块
// ═══════════════════════════════════════════════════════════════

// ===== 图片上传功能 =====
let selectedImage = null;  // 当前选中的图片 { url, filename, file }

/**
 * 压缩图片（使用 Canvas）
 * @param {File} file - 原始图片文件
 * @param {number} quality - 压缩质量 (0-100)，默认 80
 * @param {number} minSize - 最小边长，默认 1024（和 Flutter 一致）
 * @returns {Promise<Blob>} 压缩后的图片
 */
async function compressImage(file, quality = 80, minSize = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    
    img.onload = () => {
      // 计算压缩后的尺寸（和 Flutter 一致：minWidth/minHeight 1024）
      let width = img.width;
      let height = img.height;
      
      // 如果任一边大于 minSize，按比例缩小
      if (width > minSize || height > minSize) {
        if (width > height) {
          height = (height * minSize) / width;
          width = minSize;
        } else {
          width = (width * minSize) / height;
          height = minSize;
        }
      }
      
      // 创建 Canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // 转换为 Blob（JPEG 格式，质量 80%）
      canvas.toBlob(
        (blob) => {
          if (blob) {
            console.log(`📷 图片压缩: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB`);
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob 失败'));
          }
        },
        'image/jpeg',
        quality / 100
      );
    };
    
    img.onerror = () => reject(new Error('图片加载失败'));
    reader.onerror = () => reject(new Error('文件读取失败'));
    
    reader.readAsDataURL(file);
  });
}

// 处理图片选择 - 上传到服务器获取 URL
// 处理图片/文档选择 - 上传到服务器获取 URL
async function handleImageSelect(event) {
  console.log('🖼️ handleImageSelect 被调用');
  const file = event.target.files[0];
  if (!file) {
    console.log('没有选择文件');
    return;
  }

  console.log('📁 选择的文件:', file.name, 'type:', file.type, 'size:', file.size);

  // 定义允许的文档类型
  const allowedDocMimes = [
    'application/pdf',      // PDF
    'text/plain',           // 纯文本
    'text/markdown',        // Markdown
    'text/html',            // HTML
    'text/csv',             // CSV
    'application/json',     // JSON
    // Office 文档（新格式）
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // Word (.docx)
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        // Excel (.xlsx)
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PowerPoint (.pptx)
    // Office 文档（旧格式）
    'application/msword',            // Word (.doc)
    'application/vnd.ms-excel',      // Excel (.xls)
    'application/vnd.ms-powerpoint'  // PowerPoint (.ppt)
  ];
  
  // 🆕 通过文件扩展名判断类型（解决浏览器不返回 MIME 类型的问题）
  const fileExtension = file.name.split('.').pop().toLowerCase();
  const extensionMimeMap = {
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'markdown': 'text/markdown',
    'html': 'text/html',
    'htm': 'text/html',
    'csv': 'text/csv',
    'json': 'application/json',
    // Office 文档（新格式）
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Office 文档（旧格式）
    'doc': 'application/msword',
    'xls': 'application/vnd.ms-excel',
    'ppt': 'application/vnd.ms-powerpoint'
  };
  
  // 优先使用 MIME 类型，如果没有则使用扩展名判断
  let mimeType = file.type;
  if (!mimeType && extensionMimeMap[fileExtension]) {
    mimeType = extensionMimeMap[fileExtension];
    console.log(`浏览器未返回 MIME 类型，通过扩展名判断: ${fileExtension} → ${mimeType}`);
  }
  
  const isDocument = allowedDocMimes.includes(mimeType);
  const isImage = mimeType.startsWith('image/');
  
  // 检查文件类型
  if (!isImage && !isDocument) {
    await uiAlert('不支持的文件类型\n\n支持的格式：\n• 图片：JPG, PNG, GIF, WebP\n• 文档：PDF, TXT, MD, HTML, CSV, JSON');
    return;
  }

  // 检查文件大小
  const maxSize = isDocument ? 5 * 1024 * 1024 : 10 * 1024 * 1024;  // 文档 5MB，图片 10MB
  const maxSizeText = isDocument ? '5MB' : '10MB';
  
  if (file.size > maxSize) {
    await uiAlert(`${isDocument ? '文档' : '图片'}大小不能超过 ${maxSizeText}\n\n当前文件大小：${(file.size / 1024 / 1024).toFixed(2)}MB`);
    return;
  }

  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreview');
  const imageBtn = document.getElementById('imageBtn');

  // 显示上传中状态
  previewContainer.classList.add('show', 'uploading');
  previewImg.src = '';
  imageBtn.classList.add('has-image');
  previewImg.style.opacity = '0.5';
  
  // 添加进度条（大文件时显示）
  let progressBar = document.getElementById('uploadProgressBar');
  if (!progressBar && (file.size > 500 * 1024)) {  // 大于 500KB 显示进度条
    progressBar = document.createElement('div');
    progressBar.id = 'uploadProgressBar';
    progressBar.className = 'upload-progress-bar';
    progressBar.innerHTML = '<div class="upload-progress-fill" id="uploadProgressFill"></div>';
    previewContainer.querySelector('.image-preview-wrapper').appendChild(progressBar);
  }

  try {
    let fileToUpload = file;
    
    // 图片压缩逻辑（仅图片）
    if (isImage) {
      const FILE_SIZE_LIMIT = 200 * 1024; // 200KB（和 Flutter 一致）
      
      // 如果大于 200KB，压缩图片（和 Flutter 逻辑一致）
      if (file.size > FILE_SIZE_LIMIT && (file.type === 'image/jpeg' || file.type === 'image/webp' || file.type === 'image/png')) {
        try {
          console.log(`🔄 图片大于 200KB，开始压缩: ${(file.size / 1024).toFixed(1)}KB`);
          const compressedBlob = await compressImage(file, 80, 1024);
          // 创建新的 File 对象
          const filename = file.name.replace(/\.(png|webp)$/i, '.jpg');
          fileToUpload = new File([compressedBlob], filename, { type: 'image/jpeg' });
          console.log('图片已压缩');
        } catch (e) {
          console.warn('压缩失败，使用原图:', e.message);
        }
      } else if (file.size <= FILE_SIZE_LIMIT) {
        console.log(`📷 图片小于 200KB，跳过压缩: ${(file.size / 1024).toFixed(1)}KB`);
      }
    }
    
    // 🆕 文档上传：重新创建 File 对象，使用正确的 MIME 类型
    if (isDocument && mimeType && mimeType !== file.type) {
      fileToUpload = new File([file], file.name, { type: mimeType });
      console.log(`文档 MIME 类型已修正: ${file.type || '(空)'} → ${mimeType}`);
    }
    
    // 用 FormData 上传
    const formData = new FormData();
    formData.append('file', fileToUpload);

    console.log(`📤 开始上传${isDocument ? '文档' : '图片'}到服务器...`);
    
    // 显示进度条（大文件）
    const progressBar = document.getElementById('uploadProgressBar');
    const progressFill = document.getElementById('uploadProgressFill');
    if (progressBar && file.size > 500 * 1024) {  // 大于 500KB 显示进度
      progressBar.style.display = 'block';
      if (progressFill) progressFill.style.width = '0%';
    }

    // 使用 XMLHttpRequest 支持上传进度
    const xhr = new XMLHttpRequest();
    
    // 创建 Promise 包装 XHR
    const uploadPromise = new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          const progressFill = document.getElementById('uploadProgressFill');
          if (progressFill) {
            progressFill.style.width = percent + '%';
          }
          console.log(`📤 上传进度: ${percent}%`);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        } else {
          reject(new Error(`上传失败: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('网络错误'));
      });

      xhr.open('POST', `${API_BASE}/api/upload/image`);
      // 携带认证 token
      const token = localStorage.getItem('lingxi_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });

    const data = await uploadPromise;

    if (data.success && data.url) {
      console.log(`${isDocument ? '文档' : '图片'}上传成功:`, data.url);
      
      // 隐藏进度条
      const progressBar = document.getElementById('uploadProgressBar');
      if (progressBar) {
        progressBar.style.display = 'none';
      }

      // 保存服务器返回的 URL
      selectedImage = {
        url: data.url,
        filename: data.filename,
        mimeType: data.mimeType || mimeType,
        type: data.type || (isDocument ? 'document' : 'image'),
        file: fileToUpload
      };

      // 显示预览
      if (isDocument) {
        // 🎨 根据文档类型显示美观的卡片
        const docCard = getDocumentPreviewCard(mimeType, file.name, file.size);
        previewImg.src = docCard;
        
        // 显示文件信息提示
        const fileSize = formatFileSize(file.size);
        const fileName = file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name;
        console.log(`📄 文档预览: ${fileName} (${fileSize})`);
        
        // 隐藏文件信息覆盖层（卡片已包含文件名和大小）
        const fileInfoOverlay = document.getElementById('fileInfoOverlay');
        if (fileInfoOverlay) {
          fileInfoOverlay.style.display = 'none';
        }
      } else {
        // 图片预览：显示图片
        previewImg.src = data.url;
        
        // 隐藏文件信息覆盖层
        const fileInfoOverlay = document.getElementById('fileInfoOverlay');
        if (fileInfoOverlay) {
          fileInfoOverlay.style.display = 'none';
        }
      }
      
      previewImg.style.opacity = '1';
      previewContainer.classList.remove('uploading');

      // 更新按钮显示状态（有附件了，显示发送按钮）
      updateInputButtons();
    } else {
      throw new Error(data.error || '上传失败');
    }
  } catch (e) {
    console.error(`${isDocument ? '文档' : '图片'}上传失败:`, e);
    await uiAlert(`${isDocument ? '文档' : '图片'}上传失败: ` + e.message);
    removeSelectedImage();
  }

  // 清空 input，允许重复选择同一文件
  event.target.value = '';
}

// 🎨 根据文档类型获取图标
// 🎨 获取文档预览卡片（SVG 格式，用于 img 标签）
function getDocumentPreviewCard(mimeType, filename, fileSize) {
  const typeConfig = {
    'application/pdf': { type: 'PDF', icon: 'PDF', gradient: ['#FF5252', '#FF8A80'], color: '#FF5252' },
    'text/markdown': { type: 'MD', icon: 'MD', gradient: ['#4CAF50', '#81C784'], color: '#4CAF50' },
    'text/html': { type: 'HTML', icon: '<>', gradient: ['#FF9800', '#FFB74D'], color: '#FF9800' },
    'text/csv': { type: 'CSV', icon: 'CSV', gradient: ['#2196F3', '#64B5F6'], color: '#2196F3' },
    'application/json': { type: 'JSON', icon: '{ }', gradient: ['#9C27B0', '#BA68C8'], color: '#9C27B0' },
    'text/plain': { type: 'TXT', icon: 'TXT', gradient: ['#757575', '#9E9E9E'], color: '#757575' }
  };
  
  const config = typeConfig[mimeType] || { type: 'FILE', icon: 'FILE', gradient: [_accent(), '#764ba2'], color: _accent() };
  const displayName = filename.length > 20 ? filename.substring(0, 20) + '...' : filename;
  const displaySize = fileSize ? formatFileSize(fileSize) : '';
  
  // 🎨 创建简单的 SVG 卡片（不使用 emoji，改用文字图标）
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${config.gradient[0]};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${config.gradient[1]};stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <!-- 背景卡片 -->
      <rect x="0" y="0" width="120" height="120" rx="12" fill="url(#grad)" />
      
      <!-- 文件图标（模拟文档图标） -->
      <rect x="35" y="20" width="50" height="60" rx="4" fill="rgba(255,255,255,0.3)" />
      <rect x="40" y="25" width="40" height="50" rx="2" fill="rgba(255,255,255,0.95)" />
      <rect x="45" y="35" width="30" height="2" fill="${config.color}" opacity="0.6" />
      <rect x="45" y="42" width="30" height="2" fill="${config.color}" opacity="0.6" />
      <rect x="45" y="49" width="20" height="2" fill="${config.color}" opacity="0.6" />
      
      <!-- 类型徽章 -->
      <rect x="70" y="15" width="35" height="18" rx="4" fill="rgba(255,255,255,0.95)" />
      <text x="87.5" y="27" text-anchor="middle" font-size="9" font-weight="bold" fill="${config.color}" font-family="Arial, sans-serif">${config.type}</text>
      
      <!-- 文件名 -->
      <text x="60" y="100" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.95)" font-family="Arial, sans-serif">
        ${displayName.length > 15 ? displayName.substring(0, 15) + '...' : displayName}
      </text>
    </svg>
  `;
  
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// 🎨 获取文档预览卡片（HTML iframe 格式，用于消息气泡）
// 🎨 获取文档预览卡片 HTML（直接返回 HTML 字符串，用于消息气泡）
function getDocumentPreviewCardHTML(mimeType, filename, fileSize) {
  const typeConfig = {
    'application/pdf': { type: 'PDF', icon: 'PDF', gradient: 'linear-gradient(135deg, #FF5252 0%, #FF8A80 100%)', color: '#FF5252' },
    'text/markdown': { type: 'MD', icon: 'MD', gradient: 'linear-gradient(135deg, #4CAF50 0%, #81C784 100%)', color: '#4CAF50' },
    'text/html': { type: 'HTML', icon: '&lt;&gt;', gradient: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)', color: '#FF9800' },
    'text/csv': { type: 'CSV', icon: 'CSV', gradient: 'linear-gradient(135deg, #2196F3 0%, #64B5F6 100%)', color: '#2196F3' },
    'application/json': { type: 'JSON', icon: '{ }', gradient: 'linear-gradient(135deg, #9C27B0 0%, #BA68C8 100%)', color: '#9C27B0' },
    'text/plain': { type: 'TXT', icon: 'TXT', gradient: 'linear-gradient(135deg, #757575 0%, #9E9E9E 100%)', color: '#757575' },
    // Office 文档（新格式）
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { type: 'DOCX', icon: 'W', gradient: 'linear-gradient(135deg, #2196F3 0%, #42A5F5 100%)', color: '#1565C0' },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { type: 'XLSX', icon: 'X', gradient: 'linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%)', color: '#2E7D32' },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { type: 'PPTX', icon: 'P', gradient: 'linear-gradient(135deg, #FF9800 0%, #FFA726 100%)', color: '#E65100' },
    // Office 文档（旧格式）
    'application/msword': { type: 'DOC', icon: 'W', gradient: 'linear-gradient(135deg, #2196F3 0%, #42A5F5 100%)', color: '#1565C0' },
    'application/vnd.ms-excel': { type: 'XLS', icon: 'X', gradient: 'linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%)', color: '#2E7D32' },
    'application/vnd.ms-powerpoint': { type: 'PPT', icon: 'P', gradient: 'linear-gradient(135deg, #FF9800 0%, #FFA726 100%)', color: '#E65100' }
  };
  
  const config = typeConfig[mimeType] || { type: 'FILE', icon: 'FILE', gradient: `linear-gradient(135deg, ${_accent()} 0%, #764ba2 100%)`, color: _accent() };
  const displayName = filename.length > 20 ? filename.substring(0, 20) + '...' : filename;
  const displaySize = fileSize ? formatFileSize(fileSize) : '';
  
  // 🎨 直接返回 HTML 字符串（不使用 data URL 或 iframe）
  return `
    <div style="width: 120px; height: 120px; background: ${config.gradient}; border-radius: 12px; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: -apple-system, BlinkMacSystemFont, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      <div style="position: absolute; top: 8px; right: 8px; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; background: rgba(255,255,255,0.95); color: ${config.color}; text-transform: uppercase;">${config.type}</div>
      <div style="width: 50px; height: 60px; margin-bottom: 8px; position: relative;">
        <div style="width: 100%; height: 100%; background: rgba(255,255,255,0.3); border-radius: 4px;"></div>
        <div style="position: absolute; top: 5px; left: 5px; right: 5px; bottom: 5px; background: rgba(255,255,255,0.95); border-radius: 2px; display: flex; align-items: center; justify-content: center;">
          <div style="font-size: 16px; font-weight: bold; color: ${config.color};">${config.icon}</div>
        </div>
      </div>
      <div style="font-size: 11px; text-align: center; padding: 0 12px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.95;">${displayName}</div>
      ${displaySize ? `<div style="font-size: 9px; opacity: 0.8; margin-top: 4px;">${displaySize}</div>` : ''}
    </div>
  `;
}
function getDocumentIcon(mimeType, filename) {
  // PDF 文档
  if (mimeType === 'application/pdf') {
    return 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="18" height="20" rx="2" fill="#FF5252" opacity="0.1"/>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#FF5252" stroke-width="1.5" fill="none"/>
        <polyline points="14 2 14 8 20 8" stroke="#FF5252" stroke-width="1.5" fill="none"/>
        <text x="12" y="15" text-anchor="middle" font-size="6" fill="#FF5252" font-weight="bold">PDF</text>
      </svg>
    `);
  }
  
  // Markdown 文档
  if (mimeType === 'text/markdown' || filename.endsWith('.md')) {
    return 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="18" height="20" rx="2" fill="#4CAF50" opacity="0.1"/>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#4CAF50" stroke-width="1.5" fill="none"/>
        <polyline points="14 2 14 8 20 8" stroke="#4CAF50" stroke-width="1.5" fill="none"/>
        <text x="12" y="15" text-anchor="middle" font-size="6" fill="#4CAF50" font-weight="bold">MD</text>
      </svg>
    `);
  }
  
  // HTML 文档
  if (mimeType === 'text/html') {
    return 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="18" height="20" rx="2" fill="#FF9800" opacity="0.1"/>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#FF9800" stroke-width="1.5" fill="none"/>
        <polyline points="14 2 14 8 20 8" stroke="#FF9800" stroke-width="1.5" fill="none"/>
        <text x="12" y="15" text-anchor="middle" font-size="5" fill="#FF9800" font-weight="bold">&lt;/&gt;</text>
      </svg>
    `);
  }
  
  // CSV 文档
  if (mimeType === 'text/csv') {
    return 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="18" height="20" rx="2" fill="#2196F3" opacity="0.1"/>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#2196F3" stroke-width="1.5" fill="none"/>
        <polyline points="14 2 14 8 20 8" stroke="#2196F3" stroke-width="1.5" fill="none"/>
        <text x="12" y="15" text-anchor="middle" font-size="6" fill="#2196F3" font-weight="bold">CSV</text>
      </svg>
    `);
  }
  
  // JSON 文档
  if (mimeType === 'application/json') {
    return 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="18" height="20" rx="2" fill="#9C27B0" opacity="0.1"/>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#9C27B0" stroke-width="1.5" fill="none"/>
        <polyline points="14 2 14 8 20 8" stroke="#9C27B0" stroke-width="1.5" fill="none"/>
        <text x="12" y="15" text-anchor="middle" font-size="5" fill="#9C27B0" font-weight="bold">{ }</text>
      </svg>
    `);
  }
  
  // 默认文档图标（TXT 等）
  return 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="2" width="18" height="20" rx="2" fill="#666" opacity="0.1"/>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#666" stroke-width="1.5" fill="none"/>
      <polyline points="14 2 14 8 20 8" stroke="#666" stroke-width="1.5" fill="none"/>
      <line x1="16" y1="13" x2="8" y2="13" stroke="#666" stroke-width="1.5"/>
      <line x1="16" y1="17" x2="8" y2="17" stroke="#666" stroke-width="1.5"/>
    </svg>
  `);
}

// 📏 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 🆕 格式化相对时间
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 172800000) return 'yesterday';
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  // 超过一周，显示绝对时间
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 移除选中的图片
function removeSelectedImage() {
  selectedImage = null;

  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreview');
  const imageBtn = document.getElementById('imageBtn');
  
  if (!previewContainer) { updateInputButtons(); return; }

  // 隐藏文件信息覆盖层
  const fileInfoOverlay = document.getElementById('fileInfoOverlay');
  if (fileInfoOverlay) {
    fileInfoOverlay.style.display = 'none';
  }

  previewContainer.classList.remove('show', 'uploading');
  if (previewImg) { previewImg.src = ''; previewImg.style.opacity = '1'; }
  if (imageBtn) imageBtn.classList.remove('has-image');

  // 更新按钮显示状态
  updateInputButtons();
}

// 构建带附件的消息内容（异步版本）
// 构建带附件的消息内容（发送给 OpenClaw）
async function buildMessageParamsAsync(text, attachment) {
  let messageText = (text !== undefined && text !== null) ? String(text) : '';
  
  if (!messageText.trim() && attachment) {
    // 根据附件类型设置默认提示语
    if (attachment.type === 'document') {
      messageText = '请帮我分析这个文档';
    } else {
      messageText = '请识别这张图片';
    }
  }
  
  const params = {
    sessionKey: currentSessionKey,
    message: messageText,
    idempotencyKey: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    deliver: false
  };
  
  // 直接传 URL，后端代理会自动下载转 base64
  if (attachment && attachment.url) {
    params.attachments = [{
      type: attachment.type || 'image',  // 'image' 或 'document'
      url: attachment.url,
      mimeType: attachment.mimeType || 'image/png',
      filename: attachment.filename || 'attachment'
    }];
    
    // 🆕 双重保险：在消息文本中保存附件信息
    // 格式：[附件:类型:文件名:URL]
    const type = attachment.type === 'document' ? '文档' : '图片';
    const attachmentInfo = `[附件:${type}:${attachment.filename}:${attachment.url}]`;
    params.message = `${attachmentInfo}\n\n${messageText}`;
    
    console.log(`  - attachments: 1个${attachment.type === 'document' ? '文档' : '图片'}`);
    console.log('  - url:', attachment.url);
    console.log('  - mimeType:', attachment.mimeType);
    console.log('  - 双重保险：已将附件信息保存到消息文本');
    console.log('  - 附件标记:', attachmentInfo);
  }

  return params;
}

async function sendMessage() {
  console.log('🔔 sendMessage 被调用, currentSessionKey:', currentSessionKey);
  console.log('🔔 selectedImage:', selectedImage ? '有图片' : '无图片');

  if (!currentSessionKey) {
    console.error('currentSessionKey 为空');
    await uiAlert('会话未初始化，请刷新页面');
    return;
  }

  const input = document.getElementById('inputField');
  let text = (input && input.value) ? String(input.value).trim() : '';
  console.log('📝 输入文本:', text ? `"${text}"` : '(空)');

  // Prepend skill tags to message
  const skillTags = (typeof _getSkillTags === 'function') ? _getSkillTags() : [];
  if (skillTags.length > 0) {
    const tagText = skillTags.map(t => `[${t.name}]`).join(' ');
    text = tagText + (text ? ' ' + text : '');
    if (typeof _clearSkillTags === 'function') _clearSkillTags();
  }

  console.log('📝 最终文本:', text ? `"${text}"` : '(空)');
  console.log('📝 text 类型:', typeof text);

  // 允许发送图片或文本，至少要有一种
  if (!text && !selectedImage) {
    console.log('文本和图片都为空，跳过发送');
    return;
  }

  // 隐藏欢迎界面（如果存在）
  hideWelcomeHome();

  // 显示用户消息（包含图片预览）
  addMessage('user', selectedImage ? { text, image: selectedImage.url } : text, user?.nickname || '我');

  // 清空输入和图片
  input.value = '';
  input.style.height = 'auto';
  const currentImage = selectedImage;  // 保存当前图片引用
  removeSelectedImage();

  // 更新按钮显示状态（恢复到初始状态）
  updateInputButtons();

  // Lume 优先发送（付费用户）
  if (window.USE_LUME && typeof sendMessageViaLume === 'function') {
    const sent = await sendMessageViaLume(text);
    if (sent) return;
  }

  // Lume 不可用时使用 HTTP 代理降级
  console.log('📡 Lume 不可用，使用 HTTP 代理');
  const params = await buildMessageParamsAsync(text, currentImage);
  sendViaHTTP(params.message);
}

// 处理发送/停止按钮点击
function handleSendClick() {
  console.log('🖱️ 发送按钮被点击, isGenerating:', isGenerating);
  if (isGenerating) {
    abortChat();
  } else {
    sendMessage();
  }
}

// 更新发送按钮状态
function updateSendButton() {
  const btn = document.getElementById('sendBtn');
  if (!btn) return;
  if (isGenerating) {
    btn.innerHTML = `<svg class="stop-spin-ring" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="40 20" stroke-linecap="round"/></svg><svg class="stop-icon" width="10" height="10" viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor"/></svg>`;
    btn.classList.add('stopping');
    btn.classList.remove('hidden');
    btn.title = 'Stop generating';
  } else {
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
    btn.classList.remove('stopping');
    btn.title = 'Send';
    // Re-check visibility
    if (typeof _updateSendBtnVisibility === 'function') _updateSendBtnVisibility();
  }
}

// 中止对话
function abortChat() {
  // 尝试通过 Lume 中止
  if (window.USE_LUME && typeof LumeRpc !== 'undefined' && LumeRpc.isConnected() && currentSessionKey) {
    LumeRpc.pluginCall('chat.abort', { sessionKey: currentSessionKey, runId: currentRunId }).catch(() => {});
  }

  isGenerating = false;
  currentRunId = null;
  updateSendButton();
  removeTyping();
  console.log('已发送中止请求');
}

// 加载聊天历史

// ═══════════════════════════════════════════════════════════════
// 📝 会话模块
// ═══════════════════════════════════════════════════════════════
let _historyLoading = false;
let _historyLoadSession = null; // 记录当前正在加载哪个 session

/**
 * 纯数据获取：通过 chat.history API 拉取消息（核心引擎已过滤心跳/NO_REPLY/tool痕迹）
 * @returns {Array|null} messages 数组或 null
 */
async function fetchChatHistory(sessionKey, limit = 20) {
  if (!window.USE_LUME || typeof LumeRpc === 'undefined' || !LumeRpc.isConnected() || !sessionKey) return null;

  try {
    const payload = await LumeRpc.pluginCall('chat.history', { sessionKey, limit });
    if (payload?.messages) return payload.messages;
    return null;
  } catch (e) {
    console.warn('fetchChatHistory failed:', e);
    return null;
  }
}

async function loadChatHistory(appendOnly = false) {
  // 防重复：同一 session 不能并发加载
  if (_historyLoading && _historyLoadSession === currentSessionKey) {
    console.log('⏳ 历史正在加载中，跳过重复请求, session:', currentSessionKey);
    return;
  }
  _historyLoading = true;
  _historyLoadSession = currentSessionKey;
  console.log('📚 loadChatHistory 开始, currentSessionKey:', currentSessionKey, '追加模式:', appendOnly);

  const useLume = window.USE_LUME && typeof LumeRpc !== 'undefined' && LumeRpc.isConnected();

  if (!useLume) {
    console.log('Lume 未连接，无法加载历史');
    _historyLoading = false;
    if (!appendOnly) renderHistory([]);
    return;
  }

  if (!currentSessionKey) {
    console.log('currentSessionKey 未设置，跳过加载历史');
    _historyLoading = false;
    if (!appendOnly) renderHistory([]);
    return;
  }

  console.log('📚 发送 chat.history 请求, sessionKey:', currentSessionKey, '(Lume)');

  try {
    const payload = await LumeRpc.pluginCall('chat.history', {
      sessionKey: currentSessionKey,
      limit: 100,
    });
    const res = { ok: true, payload };

    console.log('📚 chat.history 完整响应:', JSON.stringify(res, null, 2));

    if (res.ok && res.payload?.messages) {
      console.log('加载了', res.payload.messages.length, '条历史消息');
      renderHistory(res.payload.messages);
    } else if (res.ok && res.payload?.transcript) {
      console.log('使用 transcript 字段, 长度:', res.payload.transcript.length);
      renderHistory(res.payload.transcript);
    } else {
      console.log('无历史消息, res.ok:', res.ok, 'payload:', res.payload);
      renderHistory([]);
    }
  } catch (e) {
    console.error('加载历史失败:', e);
    renderHistory([]);
  } finally {
    _historyLoading = false;
    _historyLoadSession = null;
  }
}

/**
 * 初始化时智能选择有历史的会话（修复 Web 切 Session 后移动端仍显示首页）
 */
async function resolveInitialSession() {
  updateMobileSessionsState();

  const useLume = window.USE_LUME && typeof LumeRpc !== 'undefined' && LumeRpc.isConnected();
  if (!useLume) {
    await loadChatHistory();
    return;
  }

  const candidates = getSessionCandidateKeys();
  for (const key of candidates) {
    if (!key) continue;
    syncCurrentSessionKey(key);
    const messages = await fetchChatHistory(key, 100);
    if (messages && messages.length > 0) {
      renderHistory(messages);
      if (typeof loadSidebarSessions === 'function') loadSidebarSessions();
      return;
    }
  }

  const fallback = candidates[0] || currentSessionKey || SESSION_KEY;
  if (fallback) syncCurrentSessionKey(fallback);
  await loadChatHistory();
}

// 渲染历史消息
// 新增 appendOnly 参数：true=只追加（重连时使用），false=清空后重新渲染（默认）
function renderHistory(messages, appendOnly = false) {
  const container = document.getElementById('messages');

  // 如果没有消息，显示欢迎界面（带当前 Agent 的示例）
  if (!messages || messages.length === 0) {
    // 如果是追加模式且已有消息，不清空
    if (appendOnly && container.children.length > 0) {
      return; // 保留现有消息
    }
    
    const agentInfo = AGENT_INFO[currentAgentId] || AGENT_INFO['lingxi'];
    renderWelcomeHome(agentInfo);
    return;
  }

  // 追加模式：只添加新消息，不清空现有内容
  if (appendOnly) {
    // 获取现有消息的 ID 集合，避免重复
    const existingIds = new Set();
    container.querySelectorAll('.message').forEach(el => {
      const msgId = el.dataset?.messageId;
      if (msgId) existingIds.add(msgId);
    });
    
    // 只渲染新消息
    const newMessages = messages.filter(msg => !existingIds.has(msg.id));
    console.log(`📝 追加模式：收到${messages.length}条消息，其中${newMessages.length}条是新消息`);
    
    for (const msg of newMessages) {
      renderSingleMessage(msg);
    }
    return;
  }

  // 默认模式：清空容器后重新渲染
  hideWelcomeHome();
  container.innerHTML = '';

  // 渲染历史消息（chat.history 已经过核心引擎过滤，这里只做基础校验）
  for (const msg of messages) {
    const role = msg.role || 'user';
    
    // chat.history 已过滤非用户/助手角色，这里做兜底
    if (role !== 'user' && role !== 'assistant') continue;
    
    let content = extractText(msg);
    if (!content || content.trim().length === 0) continue;
    
    // 兜底：以防万一还有漏网的心跳消息
    if (content.trim() === 'HEARTBEAT_OK' || content.trim() === 'NO_REPLY') continue;
    
    // 提取附件（图片或文档）
    let imageUrl = null;
    let documentInfo = null;
    const attachments = msg.attachments || msg.parts || [];
    
    // 方案 A：从 attachments 字段提取
    if (Array.isArray(attachments) && attachments.length > 0) {
      console.log('📎 附件详情:', attachments);
      for (const att of attachments) {
        if (!att) continue;
        
        console.log('🔍 检查附件:', {
          type: att.type,
          mimeType: att.mimeType,
          url: att.url || att.content,
          filename: att.filename
        });
        
        // 🖼️ 图片附件
        const attMimeType = att.mimeType || '';
        if (att.type === 'image' || att.type?.includes('image') || attMimeType.startsWith('image/')) {
          imageUrl = att.url || att.content || att.image;
          if (imageUrl && imageUrl.length > 0) {
            console.log('📷 找到历史图片:', imageUrl);
            break;
          }
        }
        
        // 📄 文档附件
        if (att.type === 'document' || (attMimeType && !attMimeType.startsWith('image/'))) {
          const docUrl = att.url || att.content;
          if (docUrl && docUrl.length > 0) {
            documentInfo = {
              url: docUrl,
              mimeType: attMimeType || 'application/octet-stream',
              filename: att.filename || 'document',
              fileSize: att.fileSize || 0
            };
            console.log('📄 找到历史文档:', documentInfo);
            break;
          }
        }
      }
    }
    
    // 方案 B：从消息文本中提取附件信息（双重保险）
    if (!imageUrl && !documentInfo && content) {
      // 格式1：前端发送格式 [附件:图片:filename:url]
      const attachmentRegex = /\[附件:(图片|文档):([^:]+):([^\]]+)\]/;
      let match = content.match(attachmentRegex);
      
      // 格式2：OpenClaw 存储格式 [media attached: path (type) | url]
      // 例如: [media attached: /path/to/file.jpg (image/jpeg) | http://example.com/file.jpg]
      const mediaAttachedRegex = /\[media attached:\s*([^\|]+?)\s*(?:\(([^)]+)\))?\s*\|\s*([^\]]+)\]/;
      const mediaMatch = content.match(mediaAttachedRegex);
      
      if (match) {
        // 前端格式
        const type = match[1];  // '图片' 或 '文档'
        const filename = match[2];
        const url = match[3];
        
        console.log('从文本中提取附件信息(前端格式):', { type, filename, url });
        
        // 清理消息文本，移除附件标记
        const cleanContent = content.replace(attachmentRegex, '').trim();
        content = cleanContent;  // 更新 content
        
        if (type === '图片') {
          imageUrl = url;
          console.log('📷 提取到历史图片:', imageUrl);
        } else if (type === '文档') {
          // 根据文件扩展名判断 MIME 类型（支持所有格式）
          const ext = filename.split('.').pop().toLowerCase();
          const mimeMap = {
            'pdf': 'application/pdf',
            'txt': 'text/plain',
            'md': 'text/markdown',
            'markdown': 'text/markdown',
            'html': 'text/html',
            'htm': 'text/html',
            'csv': 'text/csv',
            'json': 'application/json',
            // Office 文档（新格式）
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            // Office 文档（旧格式）
            'doc': 'application/msword',
            'xls': 'application/vnd.ms-excel',
            'ppt': 'application/vnd.ms-powerpoint'
          };
          
          documentInfo = {
            url: url,
            mimeType: mimeMap[ext] || 'application/octet-stream',
            filename: filename,
            fileSize: 0
          };
          console.log('📄 提取到历史文档:', documentInfo);
        }
      } else if (mediaMatch) {
        // OpenClay 格式
        const path = mediaMatch[1].trim();
        const mimeType = mediaMatch[2] ? mediaMatch[2].trim() : '';
        const url = mediaMatch[3].trim();
        
        // 从路径提取文件名
        const filename = path.split('/').pop();
        
        console.log('从文本中提取附件信息(OpenClay格式):', { path, mimeType, url, filename });
        
        // 清理消息文本，移除附件标记
        const cleanContent = content.replace(mediaAttachedRegex, '').trim();
        content = cleanContent;  // 更新 content
        
        // 将本地路径转换为代理 URL
        // /root/.openclaw/media/inbound/xxx.webp → /api/media/inbound/xxx.webp
        let proxyUrl = url;
        if (url.startsWith('/root/.openclaw/media/')) {
          const relativePath = url.replace('/root/.openclaw/media/', '');
          proxyUrl = `/api/media/${relativePath}?user_id=${currentUserId || ''}`;
          console.log('转换本地路径为代理 URL:', proxyUrl);
        }
        
        // 判断是图片还是文档
        if (mimeType.startsWith('image/')) {
          imageUrl = proxyUrl;
          console.log('📷 提取到历史图片(OpenClay格式):', imageUrl);
        } else if (mimeType.startsWith('video/')) {
          // 视频也当作图片处理（显示预览）
          imageUrl = proxyUrl;
          console.log('🎬 提取到历史视频(OpenClay格式):', imageUrl);
        } else {
          // 其他类型当作文档处理
          documentInfo = {
            url: proxyUrl,
            mimeType: mimeType || 'application/octet-stream',
            filename: filename,
            fileSize: 0
          };
          console.log('📄 提取到历史文档(OpenClay格式):', documentInfo);
        }
      }
    }
    
    // 如果没有内容且没有附件，跳过
    if (!content && !imageUrl && !documentInfo) continue;

    const name = role === 'user' ? (user?.nickname || '我') : '灵犀';
    
    // 🆕 从历史消息中提取模型信息
    const historyModelInfo = (role === 'assistant' && (msg.model || msg.usage)) ? {
      model: msg.model || msg.modelProvider || 'auto',
      provider: msg.provider,
      inputTokens: msg.usage?.input || msg.usage?.inputTokens || null,
      outputTokens: msg.usage?.output || msg.usage?.outputTokens || null,
    } : null;
    
    // 根据附件类型传递不同格式
    if (imageUrl) {
      addMessage(role, { text: content || '', image: imageUrl }, name, historyModelInfo);
    } else if (documentInfo) {
      addMessage(role, { text: content || '', document: documentInfo }, name, historyModelInfo);
    } else {
      addMessage(role, content, name, historyModelInfo);
    }
  }

  console.log('渲染了', messages.length, '条历史消息');

  // 强制滚动到底部（延迟确保DOM渲染完成）
  const scrollToBottom = () => {
    scrollChatToBottom(true);
    console.log('📜 已滚动到底部');
  };

  // 多次尝试滚动，确保生效
  setTimeout(scrollToBottom, 50);
  setTimeout(scrollToBottom, 200);
  setTimeout(scrollToBottom, 500);
  updateLatestAssistantMessageActions();
}

// ===== 会话管理 =====

// 会话列表（挂载到 window，让 chat.html 可以访问）
window.sessions = [];

// 本地已删除的会话 key 列表（持久化到 localStorage）
const DELETED_SESSIONS_KEY = 'lingxi_deleted_sessions';
function getDeletedSessions() {
  try {
    return JSON.parse(localStorage.getItem(DELETED_SESSIONS_KEY) || '[]');
  } catch {
    return [];
  }
}
function addDeletedSession(key) {
  const deleted = getDeletedSessions();
  if (!deleted.includes(key)) {
    deleted.push(key);
    localStorage.setItem(DELETED_SESSIONS_KEY, JSON.stringify(deleted));
    console.log('📝 记录已删除会话:', key);
  }
}
function isSessionDeleted(key) {
  return getDeletedSessions().includes(key);
}

// 清除所有本地会话缓存（用于用户首次领取团队后）
function clearAllSessions() {
  window.sessions = [];
  localStorage.removeItem(DELETED_SESSIONS_KEY);
  localStorage.removeItem('lingxi_last_session_key');
  console.log('已清除所有本地会话缓存');
}

// 加载会话列表
// loadSessions: 会话列表由 chat-lume.js 的 loadLumeSessions() 通过 Lume RPC 加载
// 此函数保留作为 loadLumeSessions 的回调，渲染已加载的 window.sessions
async function loadSessions() {
  renderSessionList();
  if (typeof loadSidebarSessions === 'function') {
    loadSidebarSessions();
  }
}

// 渲染会话列表
function renderSessionList() {
  const container = document.getElementById('sessionList');

  // 如果 sessionList 容器不存在（新布局使用侧边栏），跳过
  if (!container) {
    console.log('sessionList 容器不存在，跳过 renderSessionList');
    return;
  }

  console.log('渲染会话列表, 总会话数:', window.sessions.length);
  console.log('当前会话:', currentSessionKey);

  // 添加"新会话"按钮
  let html = `
    <div class="session-item" onclick="createNewSession()">
      <div class="session-avatar">➕</div>
      <div class="session-info">
        <div class="session-name">新会话</div>
        <div class="session-preview">开始新的对话</div>
      </div>
    </div>
  `;

  // 显示所有会话
  for (const session of window.sessions) {
    const isActive = session.key === currentSessionKey;
    
    // 🆕 使用提取的标题、预览和时间
    const displayName = session.title || session.derivedTitle || session.label || session.displayName || 'Untitled';
    const preview = session.lastMessagePreview || session.preview || session.lastMessage || 'No messages';
    const time = session.relativeTime || (session.updatedAt && typeof formatRelativeTime === 'function' ? formatRelativeTime(session.updatedAt) : '');
    
    // 截断预览文本
    const truncatedPreview = preview.substring(0, 50);
    const displayPreview = truncatedPreview + (preview.length > 50 ? '...' : '');

    console.log('会话:', session.key, 'displayName:', displayName, 'isActive:', isActive);

    html += `
      <div class="session-item ${isActive ? 'active' : ''}" onclick="switchSession('${session.key}')">
        <div class="session-avatar">${isActive ? '⚡' : '💬'}</div>
        <div class="session-info">
          <div class="session-name">${escapeHtml(displayName)}</div>
          <div class="session-preview">${time ? time + ' · ' : ''}${escapeHtml(displayPreview)}</div>
        </div>
        <button class="session-delete" onclick="event.stopPropagation(); deleteSession('${session.key}')">×</button>
      </div>
    `;
  }

  // 如果没有会话，显示提示
  if (window.sessions.length === 0) {
    html += `
      <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5);font-size:13px;">
        No history yet<br>点击"新会话"开始
      </div>
    `;
  }

  container.innerHTML = html;
}

// 创建新会话
async function createNewSession() {
  closeSessionModal();

  // 生成新的会话 key（使用从后端获取的 session prefix）
  const newSessionKey = `${SESSION_PREFIX}:chat_${Date.now()}`;
  syncCurrentSessionKey(newSessionKey);
  console.log('🆕 创建新会话:', currentSessionKey);

  // 清空聊天，显示欢迎界面
  renderWelcomeHome(AGENT_INFO[currentAgentId] || AGENT_INFO.lingxi);

  // 会话会在第一次发送消息时自动创建
  console.log('新会话已准备就绪，等待发送第一条消息');
}

window.createNewSession = createNewSession;

/** Native macOS desktop client — send from Flutter composer */
window.lumeDesktopSend = function (text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const input = document.getElementById('inputField');
  if (input) input.value = t;
  if (typeof sendMessage === 'function') {
    sendMessage();
    return true;
  }
  return false;
};

function lumeDesktopPostEvent(type, payload) {
  if (!document.documentElement.classList.contains('lume-desktop')) return;
  try {
    if (window.LumeDesktop && window.LumeDesktop.postMessage) {
      window.LumeDesktop.postMessage(JSON.stringify({ type, ...payload }));
    }
  } catch (e) { /* noop */ }
}

function lumeDesktopNotifyReply(text, title) {
  const body = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!body) return;
  lumeDesktopPostEvent('assistant_message', {
    title: title || 'Lume',
    body,
    sessionKey: typeof currentSessionKey !== 'undefined' ? currentSessionKey : '',
  });
}

window.lumeDesktopSwitchView = function (view) {
  if (typeof switchView === 'function') switchView(view);
};

window.lumeDesktopToggleRightRail = function () {
  if (typeof toggleRightSidebar === 'function') toggleRightSidebar();
};

window.lumeDesktopSwitchAgent = function (agentId) {
  if (typeof switchAgentFromDrawer === 'function') switchAgentFromDrawer(agentId);
  else if (typeof switchAgent === 'function') switchAgent(agentId);
};

window.lumeDesktopSendQuick = function (text) {
  if (typeof sendFromTeamDrawer === 'function') sendFromTeamDrawer(text);
};

window.lumeDesktopGetTeamState = function () {
  const ids =
    user && user.agents && user.agents.length ? user.agents : ['lingxi'];
  return JSON.stringify({
    currentAgentId:
      typeof currentAgentId !== 'undefined' ? currentAgentId : 'lingxi',
    agentIds: ids,
  });
};

window.lumeDesktopOpenFiles = function () {
  if (typeof openFileExplorerFromNav === 'function') openFileExplorerFromNav();
};

window.lumeDesktopToggleNotifications = function () {
  if (typeof toggleNotificationPanel === 'function') toggleNotificationPanel();
};

// 切换会话
async function switchSession(sessionKey, forceReload = false) {
  if (sessionKey === currentSessionKey && !forceReload) {
    return;
  }

  syncCurrentSessionKey(sessionKey);
  console.log('🔄 切换到会话:', sessionKey);

  // 从 sessionKey 解析 agent（格式：agent:{agentId}:{namespace}:{sessionId}）
  const parts = sessionKey.split(':');
  if (parts.length >= 2 && parts[0] === 'agent') {
    const agentId = parts[1];
    // 更新当前 agent（resolveAgentInfo 支持反向查找，如 main → lingxi）
    const resolved = resolveAgentInfo(agentId);
    const frontEndKey = resolved.id;  // 前端 key（如 'lingxi'）
    if (currentAgentId !== frontEndKey) {
      currentAgentId = frontEndKey;
      console.log('🔄 同时切换 agent:', frontEndKey, '(oc:', agentId, ')');

      // 更新导航栏图标
      const iconEl = document.getElementById('currentAgentIcon');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', resolved.icon || 'bot');
        if (window.lucide) lucide.createIcons();
      }
    }
  }

  // 清空当前消息，显示加载状态
  hideWelcomeHome();
  const container = document.getElementById('messages');
  container.innerHTML = `
    <div class="welcome welcome-loading" id="welcome">
      <p class="welcome-title">加载中...</p>
      <p class="welcome-desc">正在获取聊天历史</p>
    </div>
  `;

  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();

  // 加载该会话的历史
  try {
    await loadChatHistory();
  } catch (e) {
    console.error('加载历史失败:', e);
  }

  // 重新渲染会话列表以更新选中状态
  renderSessionList();

  // 更新侧边栏选中状态
  if (typeof loadSidebarSessions === 'function') {
    loadSidebarSessions();
  }

  console.log('会话切换完成, currentSessionKey:', currentSessionKey);
}

// 删除会话
async function deleteSession(sessionKey) {
  if (sessionKey === currentSessionKey) {
    await uiAlert('请先切换到其他对话后再删除当前对话。', { title: '无法删除' });
    return;
  }

  const session = window.sessions?.find(s => s.key === sessionKey);
  const label = session?.label || session?.title || '该对话';

  if (!await uiConfirm(`将永久删除「${label}」，此操作无法恢复。`, {
    title: '删除对话',
    confirmText: '删除',
    cancelText: '取消',
    danger: true,
  })) return;

  console.log('🗑️ 开始删除会话:', sessionKey);

  try {
    // 通过 Lume RPC 删除会话
    if (window.USE_LUME && typeof LumeRpc !== 'undefined' && LumeRpc.isConnected()) {
      await LumeRpc.sendRequest('sessions.delete', { key: sessionKey });
      console.log('删除会话成功:', sessionKey);
    }

    // 记录到本地已删除列表
    addDeletedSession(sessionKey);

    // 从本地列表中移除
    window.sessions = window.sessions.filter(s => s.key !== sessionKey);
    renderSessionList();

    // 刷新侧边栏
    if (typeof loadSidebarSessions === 'function') {
      loadSidebarSessions();
    }
  } catch (e) {
    console.error('删除会话异常:', e);
    // 失败时也删除本地
    addDeletedSession(sessionKey);
    window.sessions = window.sessions.filter(s => s.key !== sessionKey);
    renderSessionList();

    // 刷新侧边栏
    if (typeof loadSidebarSessions === 'function') {
      loadSidebarSessions();
    }
  }
}

// 带刷新的删除函数（供侧边栏调用）
window.deleteSessionWithRefresh = async function(sessionKey) {
  await deleteSession(sessionKey);
  // 刷新侧边栏
  if (typeof loadSidebarSessions === 'function') {
    loadSidebarSessions();
  }
};

// HTTP 代理备用方案
async function sendViaHTTP(text) {
  const loadingId = addTyping();
  try {
    const role = window.currentAgentId || 'lingxi';
    const model = window.userServerInfo?.preferredModel || 'auto';
    const res = await fetch(`${API_BASE}/api/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        userId: user?.id || 'web-user',
        role,
        model,
      })
    });

    removeTyping();

    // 流式响应（付费用户）
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('text/event-stream')) {
      // 创建流式消息容器
      const runId = 'http-stream-' + Date.now();
      let fullText = '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const choice = json.choices?.[0];
            const contentDelta = choice?.delta?.content || '';
            // 忽略 reasoning_content —— 后端已分离，前端只显示 content
            if (contentDelta) {
              fullText += contentDelta;
              updateStreamingMessage(fullText, runId);
            }
          } catch (_) {}
        }
      }
      finalizeStreamingMessage(fullText, runId, { model: model || 'auto' });
      return;
    }

    // 非流式响应（免费用户 / 降级）
    if (res.ok) {
      const data = await res.json();
      addMessage('assistant', data.response || '收到~', '灵犀');
    } else {
      addMessage('assistant', '网络出了点问题，稍后再试~', '灵犀');
    }
  } catch (e) {
    removeTyping();
    addMessage('assistant', '连接失败，请检查网络~', '灵犀');
  }
}

// 快捷发送
function quickSend(text) {
  document.getElementById('inputField').value = text;
  sendMessage();
}

// 添加消息
function addMessage(role, content, name, modelInfo) {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `message ${role}`;

  if (role === 'user') {
    const plain = getPlainUserText(content);
    if (plain) {
      div.dataset.userText = plain.replace(/\s+/g, ' ').slice(0, 240);
    }
  }

  // 获取当前 Agent 的头像
  const currentAgent = AGENT_INFO[currentAgentId] || { icon: 'zap', name: '灵犀' };
  const avatarHtml = role === 'user'
    ? '<div class="avatar user-avatar"><i data-lucide="user" class="icon-sm"></i></div>'
    : `<div class="avatar">${agentIcon(currentAgent, 'sm')}</div>`;

  // 处理消息内容（支持图片、文档、音频、文件和工作流）
  let bubbleContent = '';
  if (typeof content === 'object') {
    // 工作流消息类型
    if (content.workflow || content.type?.startsWith('workflow')) {
      bubbleContent = renderWorkflowMessage(content);
    }
    else if (content.audio) {
      // 🎵 音频消息
      bubbleContent = `
        <div class="audio-player" style="margin: 8px 0;">
          <audio controls style="width: 100%; height: 40px;" preload="metadata">
            <source src="${content.audio}" type="audio/mpeg">
            <source src="${content.audio}" type="audio/wav">
            <source src="${content.audio}" type="audio/ogg">
            您的浏览器不支持音频播放
          </audio>
          ${content.text ? `<div style="margin-top: 8px; font-size: 12px; color: #6B7280;">${escapeHtml(content.text)}</div>` : ''}
        </div>
      `;
    } else if (content.document) {
      // 📄 带文档的消息 - 使用纯 HTML/CSS 渲染
      const doc = content.document;
      const docCard = getDocumentPreviewCardHTML(doc.mimeType, doc.filename, doc.fileSize || 0);
      bubbleContent = `
        <div class="message-document" style="margin: 8px 0;">
          ${docCard}
        </div>
        ${content.text ? `<div style="margin-top: 8px;">${escapeHtml(content.text)}</div>` : ''}
      `;
    } else if (content.image) {
      // 📷 带图片的消息
      bubbleContent = `
        <div class="message-image">
          <img src="${content.image}" alt="上传的图片" style="width: 120px; height: 120px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; cursor: pointer;" loading="lazy" onclick="window.open('${content.image}', '_blank')">
        </div>
        ${content.text ? `<div>${escapeHtml(content.text)}</div>` : ''}
      `;
    } else if (content.text) {
      // 普通对象消息
      // 音频/文档/图片消息的附带文本也用 Markdown 渲染
      bubbleContent = renderMarkdown(content.text);
    }
  } else {
    // 处理文本消息，提取 Markdown 图片和文件路径
    const text = typeof content === 'string' ? content : '';
    
    // 使用文件预览模块处理消息
    const fileOptions = userServerInfo ? {
      serverIp: userServerInfo.serverIp, // 使用用户实例的 IP
      port: userServerInfo.fileServerPort || 9876,
      token: userServerInfo.fileServerToken // 添加文件服务 token
    } : {};
    
    // 使用 processMessageFull 同时处理 Markdown 图片、音频和文件路径
    const { text: cleanText, filesHtml, imagesHtml, audioHtml } = processMessageFull(text, fileOptions);

    // 渲染文本（Markdown）、图片、音频和文件附件
    const renderedText = cleanText ? renderMarkdown(cleanText) : '';
    bubbleContent = `
      ${renderedText}
      ${audioHtml}
      ${imagesHtml}
      ${filesHtml}
    `;
  }

  // 助手消息：操作栏在气泡下方（GPT / Claude 风格）
  const actionsHtml = role === 'assistant' ? renderBubbleActionsHtml() : '';

  div.innerHTML = `
    ${avatarHtml}
    <div class="bubble">
      ${bubbleContent}
      ${role === 'assistant' && modelInfo ? renderBubbleMeta(modelInfo) : ''}
    </div>
    ${actionsHtml}
  `;

  messages.appendChild(div);
  if (role === 'assistant') updateLatestAssistantMessageActions();
  scrollChatToBottom(true);
  if (role === 'user') updateScrollContextBar();

  if (role === 'assistant') {
    const isStreaming = Object.values(streamingMessages).some((s) => s.element === div);
    if (!isStreaming) {
      const plain = typeof content === 'string'
        ? content
        : (content && content.text ? content.text : '');
      lumeDesktopNotifyReply(plain, name);
    }
  }

  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();

  return div;
}

// 🆕 渲染气泡底部模型信息标签
function renderBubbleMeta(modelInfo) {
  const modelName = formatModelName(modelInfo.model || 'auto');
  const parts = [`<span class="meta-model">${escapeHtml(modelName)}</span>`];
  if (modelInfo.inputTokens != null) {
    parts.push(`<span class="meta-tokens">&uarr;${modelInfo.inputTokens} &darr;${modelInfo.outputTokens || 0}</span>`);
  }
  return `<div class="bubble-meta">${parts.join('<span class="meta-sep">&middot;</span>')}</div>`;
}

// 🆕 格式化模型名：auto → Auto, ocg/deepseek-v4-pro → DeepSeek V4 Pro
function formatModelName(model) {
  if (!model || model === 'auto') return 'Auto';
  // 去掉 provider 前缀
  const name = model.includes('/') ? model.split('/').pop() : model;
  const displayMap = {
    'deepseek-v4-pro': 'DeepSeek V4 Pro',
    'glm-5.1': 'GLM-5.2',
    'glm-5': 'GLM-5',
    'glm-4': 'GLM-4',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4.1': 'GPT-4.1',
    'gpt-5-mini': 'GPT-5 Mini',
    'kimi-k2.6': 'Kimi K2.6',
    'kimi-k2.5': 'Kimi K2.5',
    'qwen3-max-2026-01-23': 'Qwen3 Max',
    'qwen3.5-plus': 'Qwen3.5 Plus',
  };
  return displayMap[name] || displayMap[model] || name;
}

// 添加打字动画（同一时刻只保留一个）
function addTyping() {
  const existing = document.getElementById('typing-indicator');
  if (existing) return existing.id;

  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = 'typing-indicator';

  // 获取当前 Agent 的头像
  const currentAgent = AGENT_INFO[currentAgentId] || { icon: 'zap' };

  div.innerHTML = `
    <div class="avatar">${agentIcon(currentAgent, 'sm')}</div>
    <div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>
  `;
  messages.appendChild(div);
  scrollChatToBottom(true);
  return div.id;
}

// 移除打字动画
function removeTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// 渲染工作流消息
function renderWorkflowMessage(content) {
  // 工作流数据结构
  const workflow = content.workflow || content;
  const type = content.type || 'workflow_start';
  
  // 根据类型渲染不同的卡片
  if (type === 'workflow_start' || !type) {
    return renderWorkflowStartCard(workflow);
  } else if (type === 'workflow_progress') {
    return renderWorkflowProgressCard(workflow);
  } else if (type === 'workflow_complete') {
    return renderWorkflowCompleteCard(workflow);
  } else if (type === 'workflow_error') {
    return renderWorkflowErrorCard(workflow);
  }
  
  return renderWorkflowStartCard(workflow);
}

// 渲染工作流开始卡片 - 清爽简洁版
function renderWorkflowStartCard(data) {
  const modeLabels = {
    'single-agent': '单 Agent',
    'multi-agent': '多 Agent',
    'hybrid': '混合'
  };
  
  const stepsHtml = (data.steps || []).map((step, index) => `
    <div style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#f3f4f6;color:#6b7280;font-size:12px;font-weight:500;margin-right:12px;">${index + 1}</span>
      <div style="flex:1;">
        <div style="font-size:14px;color:#1f2937;margin-bottom:2px;">${step.name || `步骤${index + 1}`}</div>
        ${step.agent ? `<div style="font-size:12px;color:#9ca3af;">🤖 ${step.agent}</div>` : ''}
      </div>
    </div>
  `).join('');
  
  return `
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          
          <span style="font-size:15px;font-weight:600;color:#1f2937;">${data.workflowName || '工作流'}</span>
        </div>
        <span style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:4px 10px;border-radius:12px;">${modeLabels[data.mode] || '执行中'}</span>
      </div>
      
      ${data.task ? `<div style="font-size:13px;color:#6b7280;margin-bottom:12px;padding:10px;background:#f9fafb;border-radius:6px;">任务：${data.task}</div>` : ''}
      
      <div style="margin-bottom:12px;">
        ${stepsHtml}
      </div>
      
      <div style="display:flex;align-items:center;gap:6px;padding-top:12px;border-top:1px solid #f3f4f6;">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${_accent()};animation:pulse 1.5s infinite;"></span>
        <span style="font-size:13px;color:#6b7280;">执行中...</span>
      </div>
    </div>
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    </style>
  `;
}

// 渲染工作流进度更新卡片 - 清爽简洁版
function renderWorkflowProgressCard(data) {
  const stepIndex = data.stepIndex || 0;
  const stepName = data.stepName || `步骤${stepIndex + 1}`;
  const agent = data.agent || '';
  const isComplete = data.isComplete || false;
  
  return `
    <div style="padding:10px 12px;margin:8px 0;background:#f9fafb;border-left:3px solid ${isComplete ? _accent() : '#3b82f6'};border-radius:4px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:14px;"></span>
        <span style="font-size:13px;color:${isComplete ? _accent() : '#3b82f6'};font-weight:500;">
          ${isComplete ? '完成：' : '执行中：'}${stepName}
        </span>
        ${agent ? `<span style="font-size:12px;color:#9ca3af;margin-left:auto;">🤖 ${agent}</span>` : ''}
      </div>
    </div>
  `;
}

// 渲染工作流完成卡片 - 清爽简洁版
function renderWorkflowCompleteCard(data) {
  const deliverables = data.deliverables || [];
  const duration = data.duration || '';
  const steps = data.steps || [];
  const completedSteps = steps.filter(s => s.completed).length;
  
  const deliverablesHtml = deliverables.length > 0 ? `
    <div style="margin-top:12px;padding:10px;background:#f9fafb;border-radius:6px;">
      <div style="font-size:13px;color:#6b7280;margin-bottom:8px;font-weight:500;">📦 交付物</div>
      ${deliverables.map(d => `
        <div style="font-size:12px;color:#374151;margin:4px 0;display:flex;align-items:center;gap:6px;">
          <span>📄</span>
          <span>${d}</span>
        </div>
      `).join('')}
    </div>
  ` : '';
  
  return `
    <div style="background:#ffffff;border:1px solid ${_accent()};border-radius:8px;padding:16px;margin:12px 0;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        
        <div>
          <div style="font-size:16px;font-weight:600;color:#1f2937;">完成！</div>
          <div style="font-size:12px;color:#6b7280;">${data.workflowName || '工作流'} 执行成功</div>
        </div>
      </div>
      
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px;">
        <div style="background:#f9fafb;padding:10px;border-radius:6px;">
          <div style="font-size:11px;color:#9ca3af;">步骤</div>
          <div style="font-size:16px;font-weight:600;color:#1f2937;">${completedSteps}/${steps.length}</div>
        </div>
        <div style="background:#f9fafb;padding:10px;border-radius:6px;">
          <div style="font-size:11px;color:#9ca3af;">耗时</div>
          <div style="font-size:16px;font-weight:600;color:#1f2937;">${duration || '-'}</div>
        </div>
      </div>
      
      ${deliverablesHtml}
    </div>
  `;
}

// 渲染工作流错误卡片 - 清爽简洁版
function renderWorkflowErrorCard(data) {
  return `
    <div style="background:#ffffff;border:1px solid #ef4444;border-radius:8px;padding:16px;margin:12px 0;">
      <div style="display:flex;align-items:center;gap:10px;">
        
        <div>
          <div style="font-size:15px;font-weight:600;color:#1f2937;margin-bottom:4px;">工作流执行失败</div>
          <div style="font-size:13px;color:#6b7280;">${data.error || '未知错误'}</div>
        </div>
      </div>
    </div>
  `;
}

// 清空聊天
function clearChat() {
  const messages = document.getElementById('messages');
  messages.innerHTML = '';
  renderWelcomeHome(AGENT_INFO[currentAgentId] || AGENT_INFO.lingxi);
}

// 切换下拉菜单
function toggleDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

// 点击其他地方关闭下拉菜单
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown') && !e.target.closest('.sidebar-footer')) {
    document.getElementById('userDropdown')?.classList.remove('show');
    document.getElementById('sidebarUserMenu')?.classList.remove('show');
  }
});

// 显示设置
async function showSettings() {
  await uiAlert('设置功能开发中...');
}

// 显示关于
async function showAbout() {
  await uiAlert('你的 AI 团队，一键拥有\n\n浙ICP备2026013667号-2A', {
    title: 'Lume v1.0',
    confirmText: '好的',
  });
}

// 退出登录
async function logout() {
  if (await uiConfirm('退出后需要重新登录才能继续使用。', { title: '退出登录', confirmText: '退出', cancelText: '取消', danger: true })) {
    localStorage.removeItem('lingxi_token');
    localStorage.removeItem('lingxi_user');
    window.location.href = 'index.html';
  }
}

// ===== 团队管理 =====

// 显示我的团队

// ═══════════════════════════════════════════════════════════════
// 👥 Agent 模块
// ═══════════════════════════════════════════════════════════════
async function showMyTeam() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const userMenu = document.getElementById('sidebarUserMenu');
  if (userMenu) userMenu.classList.remove('show');
  // 团队管理已迁移到办公区，直接跳转
  if (typeof switchView === 'function') {
    switchView('workspace');
  }
}

// 关闭团队弹窗（已废弃，保留空函数避免调用报错）
function closeTeamModal() {}

// 渲染我的团队
function renderMyTeam() {
  // 优先使用 user.team.members（包含完整信息），回退到 user.agents
  let myAgents = [];
  let agentDetails = {};
  
  if (user?.team?.members && user.team.members.length > 0) {
    // 使用团队配置中的完整成员信息
    myAgents = user.team.members.map(m => m.id);
    agentDetails = Object.fromEntries(user.team.members.map(m => [m.id, m]));
  } else if (user?.agents && user.agents.length > 0) {
    // 回退到旧格式
    myAgents = user.agents;
  } else {
    myAgents = ['lingxi'];
  }
  
  const container = document.getElementById('myTeamList');
  if (!container) return;

  container.innerHTML = myAgents.map(agentId => {
    // 优先使用团队配置中的信息，其次 AGENT_INFO，最后默认值
    const agent = agentDetails[agentId] || AGENT_INFO[agentId] || { icon: 'bot', name: agentId, desc: 'AI 助手' };
    const isRequired = agentId === 'lingxi' || agent.isDefault;

    return `
      <div class="team-member">
        <div class="team-member-info">
          <div class="team-member-avatar">
            <i data-lucide="${agent.icon || 'bot'}" class="icon icon-lg icon-primary"></i>
          </div>
          <div>
            <div class="team-member-name">${agent.name || agentId}</div>
            <div class="team-member-role">${agent.desc || agent.role || 'AI 助手'}</div>
          </div>
        </div>
        ${isRequired ?
          '<span class="team-badge">队长</span>' :
          `<button class="remove-btn" onclick="removeAgent('${agentId}')">移除</button>`
        }
      </div>
    `;
  }).join('');

  // 如果用户没有团队，显示提示
  if (!user?.agents || user.agents.length === 0) {
    container.innerHTML += `
      <div style="text-align:center;padding:16px;color:#6b7280;font-size:13px;margin-top:12px;border-top:1px solid #e5e7eb;">
        你还没有领取完整团队<br>邀请好友获得积分后即可领取
      </div>
    `;
  }
  
  // 重新渲染图标
  if (window.lucide) lucide.createIcons();
}

// 渲染可添加的成员
async function renderAvailableAgents() {
  const container = document.getElementById('availableAgents');
  if (!container) return;

  // 获取当前团队成员 ID
  const myAgents = user?.team?.members ? user.team.members.map(m => m.id) : (user?.agents || ['lingxi']);
  
  let available = [];
  
  // 如果有团队模板，从模板中获取可添加的成员
  if (user?.team?.templateId) {
    try {
      const res = await fetch(`${API_BASE}/api/team/templates/${user.team.templateId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.template) {
          // 从模板成员中过滤掉已添加的
          available = data.template.members
            .filter(m => !myAgents.includes(m.id))
            .map(m => ({
              id: m.id,
              name: m.name,
              icon: m.icon,
              desc: m.desc
            }));
        }
      }
    } catch (e) {
      console.error('获取模板成员失败:', e);
    }
  }
  
  // 如果没有模板或模板中没有可添加的，使用 AGENT_INFO 作为回退
  if (available.length === 0) {
    available = Object.keys(AGENT_INFO).filter(id => !myAgents.includes(id)).map(id => ({
      id,
      name: AGENT_INFO[id].name,
      icon: AGENT_INFO[id].icon,
      desc: AGENT_INFO[id].desc
    }));
  }

  if (available.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:13px;">已添加全部成员</p>';
    return;
  }

  container.innerHTML = available.map(agent => `
    <div class="agent-chip" onclick="addAgent('${agent.id}')" title="${agent.desc || ''}">
      ${agentIcon(agent, 'sm')}
      <span>${agent.name}</span>
    </div>
  `).join('');

  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
}

// 添加成员
async function addAgent(agentId) {
  if (!user) return;

  // 检查是否已存在
  const currentMembers = user?.team?.members || [];
  if (currentMembers.some(m => m.id === agentId)) {
    console.log('成员已存在:', agentId);
    return;
  }

  // 优先从当前团队模板获取成员信息，其次从 AGENT_INFO 获取
  let memberInfo = null;
  
  // 1. 从当前团队模板中查找
  if (user?.team?.templateId) {
    try {
      const res = await fetch(`${API_BASE}/api/team/templates/${user.team.templateId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.template) {
          memberInfo = data.template.members.find(m => m.id === agentId);
        }
      }
    } catch (e) {
      console.error('获取模板信息失败:', e);
    }
  }
  
  // 2. 如果模板中没有，从 AGENT_INFO 获取
  if (!memberInfo) {
    memberInfo = AGENT_INFO[agentId];
  }
  
  // 3. 如果都没有，使用默认值
  if (!memberInfo) {
    memberInfo = { id: agentId, name: agentId, icon: 'bot', desc: 'AI 助手' };
  }
  
  const newMember = {
    id: agentId,
    name: memberInfo.name,
    icon: memberInfo.icon,
    role: memberInfo.desc || memberInfo.role,
    desc: memberInfo.desc || memberInfo.role,
    triggers: memberInfo.triggers || [agentId]
  };

  try {
    const res = await fetch(`${API_BASE}/api/team/${user.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify(newMember)
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // 更新本地 user 对象
      user.team = data.team;
      user.agents = data.team.members.map(m => m.id);
      localStorage.setItem('lingxi_user', JSON.stringify(user));
      
      renderMyTeam();
      await renderAvailableAgents();
      renderTeamTags();
      initAgentDropdown();
      console.log('成员添加成功:', agentId);
    } else {
      await uiAlert('添加失败：' + (data.error || '未知错误'));
    }
  } catch (e) {
    console.error('添加成员失败:', e);
    await uiAlert('网络错误：' + e.message);
  }
}


// 移除成员
async function removeAgent(agentId) {
  if (!user || !user?.team?.members) return;

  // 不允许删除默认成员（灵犀）
  const member = user.team.members.find(m => m.id === agentId);
  if (!member) {
    await uiAlert('成员不存在');
    return;
  }
  
  if (member.isDefault) {
    await uiAlert('不能删除默认成员');
    return;
  }

  if (!await uiConfirm(`将从团队中移除「${member.name}」。`, { title: '移除成员', confirmText: '移除', cancelText: '取消', danger: true })) return;

  try {
    const res = await fetch(`${API_BASE}/api/team/${user.id}/members/${agentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      }
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // 更新本地 user 对象
      user.team = data.team;
      user.agents = data.team.members.map(m => m.id);
      localStorage.setItem('lingxi_user', JSON.stringify(user));
      
      renderMyTeam();
      await renderAvailableAgents();
      renderTeamTags();
      initAgentDropdown();
      console.log('成员移除成功:', agentId);
    } else {
      await uiAlert('移除失败：' + (data.error || '未知错误'));
    }
  } catch (e) {
    console.error('移除成员失败:', e);
    await uiAlert('网络错误：' + e.message);
  }
}

// ===== 团队管理（改造版） =====

// 切换标签页
function switchTeamTab(tabId) {
  // 更新标签页状态
  document.querySelectorAll('.team-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  event.currentTarget.classList.add('active');
  
  // 切换内容
  document.getElementById('myTeamTab').style.display = tabId === 'my-team' ? 'block' : 'none';
  document.getElementById('templatesTab').style.display = tabId === 'templates' ? 'block' : 'none';
  
  // 如果切换到模板库，加载模板
  if (tabId === 'templates') {
    loadTemplates();
  }
}

// 加载团队模板
let templates = [];
let selectedTemplate = null;

async function loadTemplates() {
  const container = document.getElementById('templatesGrid');
  if (!container) return;
  
  container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">加载中...</div>';
  
  try {
    const res = await fetch(`${API_BASE}/api/team/templates`);
    const data = await res.json();
    
    if (data.success) {
      templates = data.templates;
      renderTemplates();
    } else {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">加载失败</div>';
    }
  } catch (e) {
    console.error('加载模板失败:', e);
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">网络错误</div>';
  }
}

// 渲染模板列表
function renderTemplates() {
  const container = document.getElementById('templatesGrid');
  if (!container) return;
  
  const iconMap = {
    'software-dev': 'layers',
    'content-marketing': 'megaphone',
    'lingxi-team': 'zap'
  };
  
  container.innerHTML = templates.map(template => `
    <div class="template-card" onclick="showTemplateDetail('${template.templateId}')">
      <div class="template-card-header">
        <i data-lucide="${iconMap[template.templateId] || 'users'}" class="icon-lg icon-primary"></i>
        <div class="template-card-title">${template.templateName}</div>
      </div>
      <div class="template-card-desc">${template.description}</div>
      <div class="template-card-meta">
        <span class="template-card-members"><i data-lucide="users" class="icon-sm"></i> ${template.memberCount} 人</span>
        <span class="template-card-category">${template.category === 'development' ? '开发' : template.category === 'marketing' ? '营销' : '助手'}</span>
      </div>
    </div>
  `).join('');
  
  // 重新渲染图标
  if (window.lucide) lucide.createIcons();
}

// 显示模板详情
async function showTemplateDetail(templateId) {
  try {
    const res = await fetch(`${API_BASE}/api/team/templates/${templateId}`);
    const data = await res.json();
    
    if (data.success) {
      selectedTemplate = data.template;
      renderTemplateDetail(data.template);
      document.getElementById('templateDetailModal').classList.add('show');
    }
  } catch (e) {
    console.error('加载模板详情失败:', e);
    await uiAlert('加载模板详情失败');
  }
}

// 渲染模板详情
function renderTemplateDetail(template) {
  const container = document.getElementById('templateDetailContent');
  document.getElementById('templateDetailTitle').textContent = template.templateName;
  
  const iconMap = {
    'lingxi': 'zap',
    'pm': 'target',
    'architect': 'layers',
    'frontend': 'monitor',
    'backend': 'server',
    'qa': 'check-circle',
    'copywriter': 'pen-tool',
    'designer': 'palette',
    'seo': 'trending-up',
    'social': 'share-2',
    'coder': 'code',
    'ops': 'bar-chart-2',
    'inventor': 'lightbulb',
    'noter': 'book-open',
    'media': 'image',
    'smart': 'home'
  };
  
  container.innerHTML = `
    <div class="template-detail-desc">
      ${template.description}
    </div>
    <div class="template-detail-members">
      <h4>团队成员 (${template.members.length}人)</h4>
      <div class="template-member-list">
        ${template.members.map(member => `
          <div class="template-member-item">
            <div class="template-member-icon">
              <i data-lucide="${member.icon || iconMap[member.id] || 'bot'}" class="icon icon-lg icon-primary"></i>
            </div>
            <div class="template-member-info">
              <div class="template-member-name">${member.name}</div>
              <div class="template-member-role">${member.role || member.desc || ''}</div>
              ${member.triggers && member.triggers.length > 0 ? `
                <div class="template-member-triggers">
                  ${member.triggers.slice(0, 3).map(t => `<span class="template-trigger-tag">${t}</span>`).join('')}
                </div>
              ` : ''}
            </div>
            ${member.isDefault ? '<span class="template-member-badge">队长</span>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  // 重新渲染图标
  if (window.lucide) lucide.createIcons();
}

// 关闭模板详情弹窗
function closeTemplateDetailModal() {
  document.getElementById('templateDetailModal').classList.remove('show');
  selectedTemplate = null;
}

// 确认应用模板
async function confirmApplyTemplate() {
  if (!selectedTemplate || !user) {
    await uiAlert('请先选择模板');
    return;
  }
  
  const btn = document.getElementById('applyTemplateBtn');
  btn.disabled = true;
  btn.textContent = '应用中...';
  
  try {
    const res = await fetch(`${API_BASE}/api/team/${user.id}/apply-template/${selectedTemplate.templateId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      }
    });
    
    const data = await res.json();
    
    if (data.success) {
      // 保存模板名称（在关闭弹窗前）
      const templateName = selectedTemplate?.templateName || '团队模板';
      const templateId = selectedTemplate?.templateId;
      // 更新本地用户信息
      user.team = data.team;
      user.agents = data.team.members.map(m => m.id);
      localStorage.setItem('lingxi_user', JSON.stringify(user));
      
      // 关闭弹窗
      closeTemplateDetailModal();
      closeTeamModal();
      
      // 刷新界面
      renderMyTeam();
      await renderAvailableAgents();
      renderTeamTags();
      initAgentDropdown();  // 刷新顶部 agent 下拉列表
      
      // 显示成功提示
      showToast('success', `已应用模板：${templateName}`);
      
      console.log('模板应用成功:', templateId);
    } else {
      await uiAlert('应用失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    console.error('应用模板失败:', e);
    console.error('异常堆栈:', e.stack);
    console.error('selectedTemplate:', selectedTemplate);
    await uiAlert('网络错误：' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '应用此模板';
  }
}

// 显示 Toast 提示
function showToast(type, message) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  if (type === 'success') {
    toast.style.background = _accent();
  } else if (type === 'error') {
    toast.style.background = '#ef4444';
  }
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== 会话列表 =====

function showSessionList() {
  document.getElementById('sessionModal').classList.add('show');
}

function closeSessionModal() {
  document.getElementById('sessionModal').classList.remove('show');
}

// ===== 飞书配置 =====


// ═══════════════════════════════════════════════════════════════
// ⚙️ 配置模块
// ═══════════════════════════════════════════════════════════════
async function showFeishuConfig() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const userMenu = document.getElementById('sidebarUserMenu');
  if (userMenu) userMenu.classList.remove('show');

  if (!user || !user.id) {
    await uiAlert('请先登录');
    return;
  }

  loadFeishuStatus();
      closeFeishuModal(); // 关闭弹窗
  document.getElementById('feishuModal').classList.add('show');
}

function closeFeishuModal() {
  document.getElementById('feishuModal').classList.remove('show');
}

async function loadFeishuStatus() {
  const statusEl = document.getElementById('feishuStatus');
  statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5)">加载中...</span>';

  try {
    const res = await fetch(`${API_BASE}/api/remote-config/status/${user.id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}` }
    });
    const data = await res.json();

    if (data.config?.feishu?.configured) {
      statusEl.innerHTML = `<span style="color:#4ade80">已配置</span>`;
      document.getElementById('feishuWebhook').style.display = 'block';
      document.getElementById('feishuWebhookUrl').value = data.config.feishu.webhookUrl || '';
    } else {
      statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5)">未配置</span>';
      document.getElementById('feishuWebhook').style.display = 'none';
    }
  } catch (e) {
    statusEl.innerHTML = '<span style="color:#f87171">加载失败</span>';
  }
}

async function saveFeishuConfig(e) {
  e.preventDefault();

  const appId = document.getElementById('feishuAppId').value.trim();
  const appSecret = document.getElementById('feishuAppSecret').value.trim();

  if (!appId || !appSecret) {
    await uiAlert('请填写完整信息');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/feishu/configure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({
        userId: user.id,
        appId,
        appSecret,
        verificationToken: document.getElementById('feishuVerificationToken')?.value.trim() || undefined
      })
    });

    const data = await res.json();

    if (data.success) {
      await uiAlert(`飞书配置成功！\n\n请在飞书开放平台配置：\n1. 进入应用管理 → 事件订阅\n2. 选择 WebSocket 连接方式\n3. 订阅事件：im.message.receive_v1\n4. 点击"保存"\n\n配置完成后即可在飞书里与机器人对话！`);

      loadFeishuStatus();
      closeFeishuModal(); // 关闭弹窗
    } else {
      await uiAlert('配置失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    await uiAlert('网络错误: ' + e.message);
  }
}

function copyFeishuWebhook() {
  const input = document.getElementById('feishuWebhookUrl');
  input.select();
  document.execCommand('copy');
  if (typeof showLumeToast === 'function') showLumeToast('已复制到剪贴板', 'success');
  else uiAlert('已复制到剪贴板');
}

// ===== 企业微信配置 =====

async function showWecomConfig() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const userMenu = document.getElementById('sidebarUserMenu');
  if (userMenu) userMenu.classList.remove('show');

  if (!user || !user.id) {
    await uiAlert('请先登录');
    return;
  }

  loadWecomStatus();
  document.getElementById('wecomModal').classList.add('show');
}

function closeWecomModal() {
  document.getElementById('wecomModal').classList.remove('show');
}

async function loadWecomStatus() {
  const statusEl = document.getElementById('wecomStatus');
  statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5)">加载中...</span>';

  try {
    const res = await fetch(`${API_BASE}/api/remote-config/status/${user.id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}` }
    });
    const data = await res.json();

    if (data.config?.wecom?.configured) {
      statusEl.innerHTML = `<span style="color:#4ade80">已配置</span>`;
      document.getElementById('wecomWebhook').style.display = 'block';
      document.getElementById('wecomWebhookUrl').value = data.config.wecom.callbackUrl || '';
    } else {
      statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5)">未配置</span>';
      document.getElementById('wecomWebhook').style.display = 'none';
    }
  } catch (e) {
    statusEl.innerHTML = '<span style="color:#f87171">加载失败</span>';
  }
}

async function saveWecomConfig(e) {
  e.preventDefault();

  const corpId = document.getElementById('wecomCorpId').value.trim();
  const agentId = document.getElementById('wecomAgentId').value.trim();
  const agentSecret = document.getElementById('wecomAgentSecret').value.trim();
  const token = document.getElementById('wecomToken')?.value.trim() || '';
  const encodingAesKey = document.getElementById('wecomEncodingAesKey')?.value.trim() || '';

  if (!corpId || !agentId || !agentSecret) {
    await uiAlert('请填写完整信息');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/remote-config/wecom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({
        userId: user.id,
        corpId,
        agentId,
        secret: agentSecret,
        token,
        encodingAesKey
      })
    });

    const data = await res.json();

    if (data.success) {
      const callbackInfo = data.webhook ? `\n\n请配置回调地址：\n${data.webhook.callbackUrl}` : '';
      await uiAlert('企业微信配置成功！' + callbackInfo);
      loadWecomStatus();
      closeWecomModal();
    } else {
      await uiAlert('配置失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    await uiAlert('网络错误: ' + e.message);
  }
}

function copyWecomWebhook() {
  const input = document.getElementById('wecomWebhookUrl');
  input.select();
  document.execCommand('copy');
  if (typeof showLumeToast === 'function') showLumeToast('已复制到剪贴板', 'success');
  else uiAlert('已复制到剪贴板');
}

// ===== 修改密码 =====

function showPasswordChange() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const userMenu = document.getElementById('sidebarUserMenu');
  if (userMenu) userMenu.classList.remove('show');
  document.getElementById('passwordForm').reset();
  document.getElementById('passwordModal').classList.add('show');
}

function closePasswordModal() {
  document.getElementById('passwordModal').classList.remove('show');
}

async function changePassword(e) {
  e.preventDefault();

  const currentPwd = document.getElementById('currentPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;

  if (newPwd !== confirmPwd) {
    await uiAlert('两次输入的新密码不一致');
    return;
  }

  if (newPwd.length < 6) {
    await uiAlert('新密码至少6位');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({
        currentPassword: currentPwd,
        password: newPwd
      })
    });

    const data = await res.json();

    if (data.success) {
      await uiAlert('密码修改成功！');
      closePasswordModal();
    } else {
      await uiAlert('修改失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    await uiAlert('网络错误: ' + e.message);
  }
}

// 更新导航栏用户名（显示首字母）
function updateNavUserName() {
  const nameEl = document.getElementById('navUserInitial');
  if (nameEl && user?.nickname) {
    nameEl.textContent = user.nickname.charAt(0).toUpperCase();
  }
}

// Markdown 渲染（使用 marked.js）
function renderMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  try {
    // 检查是否有 Markdown 语法（避免纯文本走 Markdown）
    const hasMarkdown = /[*_`~#>|\-]\S|\S[*_`~]|^\s*[-*+]\s|^-{3,}|^#{1,6}\s|\|.*\|/m.test(text);
    if (!hasMarkdown) {
      return `<div class="chat-text">${escapeHtmlBasic(text)}</div>`;
    }
    if (typeof marked !== 'undefined' && marked.parse) {
      const html = marked.parse(text, {
        breaks: true,
        gfm: true,
      });
      return `<div class="chat-text">${html}</div>`;
    }
    // fallback：没有 marked 就纯文本
    return `<div class="chat-text">${escapeHtmlBasic(text)}</div>`;
  } catch (e) {
    console.warn('Markdown 渲染失败:', e);
    return `<div class="chat-text">${escapeHtmlBasic(text)}</div>`;
  }
}

// 基础 HTML 转义（不处理换行，给 Markdown 用）
function escapeHtmlBasic(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// 复制气泡内容
function copyBubble(btn) {
  const message = btn.closest('.message');
  const bubble = message?.querySelector('.bubble') || btn.closest('.bubble');
  if (!bubble) return;
  const clone = bubble.cloneNode(true);
  clone.querySelectorAll('.bubble-actions, .bubble-copy-btn, .bubble-action-btn, .bubble-meta').forEach((el) => el.remove());
  const text = clone.textContent || clone.innerText || '';
  navigator.clipboard.writeText(text.trim()).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    }, 2000);
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text.trim();
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 2000);
  });
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// 启动
try {
  init();
  updateNavUserName();
  console.log('页面初始化完成');
} catch (e) {
  console.error('页面初始化失败:', e);
  uiAlert('页面初始化失败: ' + e.message);
}

// ==================== Agent 切换功能 ====================

// 直接复用 AGENT_INFO，确保 key 一致（lingxi, coder, ops 等）
const ALL_AGENTS = Object.fromEntries(
  Object.keys(AGENT_INFO).map(id => {
    const info = AGENT_INFO[id];
    return [id, { id, name: info.name, icon: info.icon, desc: info.desc }];
  })
);

let currentAgentId = 'lingxi';
let userAgentList = ['lingxi'];

// ==================== 引导系统 ====================

let selectedJobType = null;
let recommendationData = null;

// 检查并启动引导

// ═══════════════════════════════════════════════════════════════
// 引导模块
// ═══════════════════════════════════════════════════════════════
async function checkOnboarding() {
  try {
    // 复用 init() 已获取的全局 user 对象，避免重复请求 /api/auth/me
    const userData = user;

    if (!userData || !userData.id) {
      console.warn('用户数据未加载，跳过引导检查');
      return true;
    }

    // 检查是否完成引导
    if (userData.onboardingCompleted !== true) {
      console.log('用户未完成引导，启动引导流程');
      startOnboarding();
      return false;
    }

    return true;
  } catch (e) {
    console.error('检查引导状态失败:', e);
    return true; // 出错时跳过引导
  }
}

// 启动引导
async function startOnboarding() {
  // 加载职业类型
  await loadJobTypes();

  // 显示引导弹窗
  document.getElementById('onboardingModal').style.display = 'flex';

  // 重置到第一步
  goToOnboardingStep(1);
}

// 加载职业类型
async function loadJobTypes() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/onboarding/job-types`);
    const data = await res.json();

    const grid = document.getElementById('jobTypeGrid');
    grid.innerHTML = data.jobTypes.map(job => `
      <div class="job-type-item" onclick="selectJobType('${job.id}')" data-job="${job.id}">
        ${job.label}
      </div>
    `).join('');
  } catch (e) {
    console.error('加载职业类型失败:', e);
  }
}

// 选择职业类型
async function selectJobType(jobId) {
  // 更新选中状态
  document.querySelectorAll('.job-type-item').forEach(el => {
    el.classList.remove('selected');
  });
  document.querySelector(`[data-job="${jobId}"]`)?.classList.add('selected');

  selectedJobType = jobId;

  // 获取推荐
  try {
    const res = await fetch(`${API_BASE}/api/auth/onboarding/recommendation/${jobId}`);
    recommendationData = await res.json();

    // 延迟跳转，让用户看到选中效果
    setTimeout(() => goToOnboardingStep(3), 300);
  } catch (e) {
    console.error('获取推荐失败:', e);
  }
}

// 切换引导步骤
function goToOnboardingStep(step) {
  // 隐藏所有步骤
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`onboardingStep${i}`).style.display = 'none';
  }

  // 显示当前步骤
  document.getElementById(`onboardingStep${step}`).style.display = 'block';

  // 如果是步骤3，渲染推荐
  if (step === 3 && recommendationData) {
    renderRecommendation();
  }
}

// 渲染推荐配置
function renderRecommendation() {
  const rec = recommendationData.recommendation;
  const hint = document.getElementById('recommendationHint');
  const agentsContainer = document.getElementById('recommendationAgents');

  hint.textContent = `${rec.label}的推荐配置`;

  agentsContainer.innerHTML = rec.agents.map(agentId => {
    const agent = AGENT_INFO[agentId];
    return `
      <div class="recommendation-agent">
        <div class="emoji">${agentIcon(agent)}</div>
        <div class="info">
          <div class="name">${agent.name}</div>
          <div class="desc">${agent.desc}</div>
        </div>
      </div>
    `;
  }).join('');

  // 添加灵犀（始终存在）
  const lingxiAgent = AGENT_INFO['lingxi'];
  agentsContainer.innerHTML = `
    <div class="recommendation-agent">
      <div class="emoji">${agentIcon(lingxiAgent)}</div>
      <div class="info">
        <div class="name">灵犀</div>
        <div class="desc">队长 · 智能调度</div>
      </div>
    </div>
  ` + agentsContainer.innerHTML;
}

// 应用推荐配置
async function applyRecommendation() {
  const btn = document.getElementById('applyRecommendationBtn');
  btn.disabled = true;
  btn.textContent = '配置中...';

  try {
    const agents = ['lingxi', ...recommendationData.recommendation.agents];

    const res = await fetch(`${API_BASE}/api/auth/onboarding/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({
        jobType: selectedJobType,
        agents: agents
      })
    });

    const data = await res.json();

    if (data.success) {
      // 更新本地用户信息
      user = { ...user, ...data.user };
      localStorage.setItem('lingxi_user', JSON.stringify(user));

      // 渲染团队预览
      renderTeamPreview(agents);

      // 跳转到完成步骤
      goToOnboardingStep(4);
    } else {
      await uiAlert('配置失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    await uiAlert('网络错误: ' + e.message);
  }

  btn.disabled = false;
  btn.textContent = '应用配置';
}

// 渲染团队预览
function renderTeamPreview(agents) {
  const preview = document.getElementById('teamPreview');
  preview.innerHTML = agents.map(agentId => {
    const agent = AGENT_INFO[agentId];
    return `<div class="team-preview-avatar">${agentIcon(agent)}</div>`;
  }).join('');

  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
}

// 开始对话（完成引导后）
function startChat() {
  // 关闭引导弹窗
  document.getElementById('onboardingModal').style.display = 'none';

  // 更新界面
  renderTeamTags();
  initAgentDropdown();

  console.log('引导完成，开始对话');
}

function toggleAgentDropdown() {
  const dropdown = document.getElementById('agentDropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('show');

  // 点击其他地方关闭
  if (dropdown.classList.contains('show')) {
    setTimeout(() => {
      document.addEventListener('click', closeAgentDropdownOnClickOutside);
    }, 0);
  }
}

function closeAgentDropdownOnClickOutside(e) {
  if (!e.target.closest('.agent-switcher')) {
    document.getElementById('agentDropdown')?.classList.remove('show');
    document.removeEventListener('click', closeAgentDropdownOnClickOutside);
  }
}

function renderAgentDropdown() {
  const dropdown = document.getElementById('agentDropdown');
  if (!dropdown) return;

  // 优先使用 user.team.members（包含完整信息）
  let agents = [];
  if (user?.team?.members && user.team.members.length > 0) {
    agents = user.team.members.map(m => ({
      id: m.id,
      name: m.name,
      icon: m.icon,
      desc: m.desc
    }));
  } else {
    // 回退到 userAgentList
    agents = userAgentList.map(id => {
      return ALL_AGENTS[id] || AGENT_INFO[id] || { id, name: id, icon: 'bot', desc: 'AI 助手' };
    });
  }

  if (agents.length === 0) {
    dropdown.innerHTML = '<div style="padding: 20px; text-align: center; color: #6e6e80;">暂无团队成员</div>';
    return;
  }

  dropdown.innerHTML = agents.map(agent => `
    <div class="agent-dropdown-item ${agent.id === currentAgentId ? 'active' : ''}"
         onclick="switchAgent('${agent.id}')">
      <span class="emoji">${agentIcon(agent)}</span>
      <div class="info">
        <h4>${agent.name}</h4>
        <p>${agent.desc}</p>
      </div>
    </div>
  `).join('');

  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
}

async function switchAgent(agentId) {
  if (agentId === currentAgentId) return;

  const previousAgentId = currentAgentId;
  currentAgentId = agentId;

  // 从 agent 元数据获取信息（支持 OpenClaw 动态成员）
  const agent = resolveAgentInfo(agentId);

  // 更新导航栏图标
  const iconEl = document.getElementById('currentAgentIcon');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', agent.icon || 'bot');
    if (window.lucide) lucide.createIcons();
  }

  // 关闭下拉
  document.getElementById('agentDropdown')?.classList.remove('show');

  // 更新列表
  renderAgentDropdown();

  // 每个 agent 有独立的会话
  const targetAgentId = agent.agentId || agentId;
  const targetSessionKey = `${SESSION_PREFIX}:agent:${targetAgentId}`;

  console.log('🔄 切换到 agent:', agentId, 'agentId:', targetAgentId, '会话:', targetSessionKey);

  // 检查是否需要创建新 session
  const existingSession = window.sessions?.find(s => s.key === targetSessionKey);

  if (!existingSession) {
    // 创建新的 agent session
    console.log('📝 创建新的 agent session:', targetSessionKey);
    await createAgentSession(targetSessionKey, agent.name);
  }

  // 切换到该 session
  syncCurrentSessionKey(targetSessionKey);

  // 清空当前消息区域
  const messages = document.getElementById('messages');
  if (messages) {
    messages.innerHTML = '';
  }

  // 加载该 agent 的聊天历史
  await loadChatHistory();

  // 如果没有历史记录，显示欢迎界面
  const history = window.chatHistory || [];
  if (history.length === 0) {
    updateWelcomeForAgent(agentId);
  }

  // 刷新侧边栏会话列表
  if (typeof loadSidebarSessions === 'function') {
    loadSidebarSessions();
  }

  renderTeamDrawer();
  updateScrollContextBar();
}

// 创建 agent 专属 session
async function createAgentSession(sessionKey, agentName) {
  try {
    // 通过 Lume RPC 创建 session
    if (window.USE_LUME && typeof LumeRpc !== 'undefined' && LumeRpc.isConnected()) {
      await LumeRpc.sendRequest('sessions.create', {
        key: sessionKey,
        label: agentName,
        mode: 'session'
      });
      console.log('Agent session 创建成功:', sessionKey);
    }

    // 添加到本地列表
    if (!window.sessions) window.sessions = [];
    if (!window.sessions.find(s => s.key === sessionKey)) {
      window.sessions.push({
        key: sessionKey,
        label: agentName,
        updatedAt: new Date().toISOString()
      });
    }
    return true;
  } catch (e) {
    console.error('创建 session 异常:', e);
    return false;
  }
}

// 更新欢迎界面为指定 Agent
function updateWelcomeForAgent(agentId) {
  const agentInfo = resolveAgentInfo(agentId);
  if (!agentInfo) return;
  renderWelcomeHome(agentInfo);
}

// 从欢迎界面发送示例
function sendWelcomeExample(text) {
  hideWelcomeHome();

  // 填入并发送
  const input = document.getElementById('inputField');
  input.value = text;
  sendMessage();
}

// ==================== 技能库功能 ====================

// 当前选择的 Agent 分类
let currentSkillAgentId = null;
// 技能列表数据
let allSkills = [];
// 已安装的技能列表
let installedSkills = new Set();

// 当前 Tab (local/popular)
let currentSkillTab = 'local';

// ClawHub 技能缓存
let clawHubSkillsCache = [];
let popularSkillsCache = [];

// 本地技能缓存
let localSkillsCache = [];

/**
 * 显示技能库弹窗
 */

// ═══════════════════════════════════════════════════════════════
// 技能库模块
// ═══════════════════════════════════════════════════════════════
function showSkillLibrary() {
  // 关闭其他弹窗
  document.getElementById('userDropdown')?.classList.remove('show');
  document.getElementById('sidebarUserMenu')?.classList.remove('show');
  // teamModal 已移除

  // 加载技能数据
  loadSkillLibrary();

  // 显示弹窗
  document.getElementById('skillLibraryModal').classList.add('show');
}

/**
 * 关闭技能库弹窗
 */
function closeSkillLibrary() {
  document.getElementById('skillLibraryModal').classList.remove('show');
}

/**
 * 加载技能库数据
 */
async function loadSkillLibrary() {
  const token = localStorage.getItem('lingxi_token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  try {
    // 加载本地技能库（已安装技能会单独加载）
    const res = await fetch(`${API_BASE}/api/skills/library`, { headers });
    if (res.ok) {
      const data = await res.json();
      localSkillsCache = data.skills || [];
      console.log('已加载本地技能数量:', localSkillsCache.length);
    } else {
      console.error('加载本地技能失败:', res.statusText);
      localSkillsCache = [];
    }

    // 加载热门技能
    await loadPopularSkills();

    // 加载已安装技能
    await loadInstalledSkills();

    // 渲染 Agent 分类列表
    renderSkillAgentList();

    // 默认加载本地技能
    loadLocalSkills();

  } catch (e) {
    console.error('加载技能库失败:', e);
    await uiAlert('加载技能库失败，请稍后重试');
  }
}

/**
 * 加载已安装的技能
 */
async function loadInstalledSkills() {
  const token = localStorage.getItem('lingxi_token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  try {
    const res = await fetch(`${API_BASE}/api/skills/installed`, { headers });
    if (res.ok) {
      const data = await res.json();
      installedSkills = new Set((data.skills || []).map(s => s.id));
      console.log('Installed skills:', installedSkills);
    }
  } catch (e) {
    console.error('加载已安装技能失败:', e);
  }
}

/**
 * 渲染 Agent 分类列表
 */
function renderSkillAgentList() {
  const container = document.getElementById('skillAgentList');
  if (!container) return;

  const agents = Object.entries(AGENT_SKILLS_MAP).map(([id, info]) => ({
    id,
    name: info.name,
    desc: info.desc,
    icon: AGENT_INFO[id]?.icon || 'bot'
  }));

  container.innerHTML = agents.map(agent => `
    <div class="skill-agent-item" onclick="selectSkillAgent('${agent.id}')" data-agent="${agent.id}">
      <i data-lucide="${agent.icon}" class="icon icon-sm"></i>
      <span>${agent.name}</span>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

/**
 * 选择 Agent 分类
 */
function selectSkillAgent(agentId) {
  currentSkillAgentId = agentId;

  // 更新 Active 状态
  document.querySelectorAll('.skill-agent-item').forEach(item => {
    item.classList.remove('active');
  });
  const activeItem = document.querySelector(`.skill-agent-item[data-agent="${agentId}"]`);
  if (activeItem) {
    activeItem.classList.add('active');
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // 渲染技能列表
  renderSkillGrid(agentId);
}

/**
 * 渲染技能网格
 */
async function renderSkillGrid(agentId) {
  const container = document.getElementById('skillGrid');
  const groupTitle = document.getElementById('skillGroupTitle');
  const token = localStorage.getItem('lingxi_token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  if (!container) return;

  // 获取该 Agent 的技能
  const agentName = AGENT_INFO[agentId]?.name || '未知';

  // 从后端获取该 Agent 的技能数据
  let skills = [];
  if (!window.agentSkillsData[agentId]) {
    try {
      const res = await fetch(`${API_BASE}/api/skills/agent/${agentId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        window.agentSkillsData[agentId] = data.skills || [];
      }
    } catch (e) {
      console.error('获取 Agent 技能失败:', e);
    }
  }

  skills = window.agentSkillsData[agentId] || [];

  // 更新分类标题
  groupTitle.innerHTML = `
    <i data-lucide="zap" class="icon icon-sm icon-primary"></i>
    ${agentName} 的技能 (${skills.length})
  `;

  if (skills.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: #6e6e80;">
        <i data-lucide="package" style="width: 48px; height: 48px; margin-bottom: 16px; color: #d1d5db;"></i>
        <p>暂无可用技能</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = skills.map(skill => {
    const installed = installedSkills.has(skill.id);
    return `
      <div class="skill-card" onclick="handleSkillClick('${skill.id}')">
        <div class="skill-header">
          <div class="skill-icon">
            <i data-lucide="${skill.icon || 'package'}" style="width: 24px; height: 24px; color: white;"></i>
          </div>
          <div class="skill-info">
            <div class="skill-name">${skill.desc || skill.id}</div>
            <div class="skill-desc">${skill.description || ''}</div>
          </div>
        </div>
        <div class="skill-agent-tag">来自 ${agentName}</div>
        <div class="skill-actions">
          ${installed ? `<span class="skill-badge installed" onclick="event.stopPropagation()"><i data-lucide="check-circle" class="icon-sm"></i> Installed</span><button class="skill-btn use" onclick="event.stopPropagation(); useSkill('${skill.id}')">Use</button>` : `<button class="skill-btn install" onclick="event.stopPropagation(); installAndUseSkill('${skill.id}', this)"><i data-lucide="download" class="icon-sm"></i> Install & Use</button>`}
          }
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

/**
 * 处理技能点击
 */
function handleSkillClick(skillId) {
  // 可以在这里添加更多逻辑
  console.log('点击技能:', skillId);
}

/**
 * 处理技能搜索
 */
function handleSkillSearch() {
  const searchTerm = document.getElementById('skillSearchInput').value.toLowerCase().trim();

  if (!searchTerm) {
    // 如果没有搜索词，重新渲染热门技能
    renderPopularSkills(popularSkillsCache, installedSkills);
    return;
  }

  // 搜索热门技能缓存
  const filteredSkills = popularSkillsCache.filter(skill =>
    skill.id.toLowerCase().includes(searchTerm) ||
    (skill.name && skill.name.toLowerCase().includes(searchTerm)) ||
    (skill.desc && skill.desc.toLowerCase().includes(searchTerm)) ||
    (skill.description && skill.description.toLowerCase().includes(searchTerm))
  );

  // 更新标题
  const groupTitle = document.getElementById('skillGroupTitle');
  if (groupTitle) {
    groupTitle.innerHTML = `
      <i data-lucide="search" class="icon icon-sm icon-primary"></i>
      搜索结果 (${filteredSkills.length})
    `;
  }

  // 渲染搜索结果
  const container = document.getElementById('skillGrid');
  if (!container) return;

  if (filteredSkills.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: #6e6e80;">
        <i data-lucide="search-x" style="width: 48px; height: 48px; margin-bottom: 16px; color: #d1d5db;"></i>
        <p>未找到匹配的技能</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = filteredSkills.map(skill => {
    const installed = installedSkills.has(skill.id);
    const agent = skill.agent || 'lingxi';
    const agentInfo = AGENT_INFO[agent] || { name: agent, icon: 'bot' };

    return `
      <div class="skill-card" onclick="handleSkillClick('${skill.id}')">
        <div class="skill-header">
          <div class="skill-icon" style="background:${_accent()}">
            <i data-lucide="${agentInfo.icon || 'package'}" style="width:24px;height:24px;color:white;"></i>
          </div>
          <div class="skill-info">
            <div class="skill-name">${skill.name || skill.id}</div>
            <div class="skill-desc">${skill.desc || skill.description || ''}</div>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <span class="skill-agent-tag"><i data-lucide="user" class="icon-sm"></i> ${skill.agent || '通用'}</span>
              <span class="skill-source-tag skill-source-hot"><i data-lucide="star" class="icon-sm"></i> 热门</span>
            </div>
          </div>
        </div>
        <div class="skill-actions">
          ${installed ? `<span class="skill-badge installed" onclick="event.stopPropagation()"><i data-lucide="check-circle" class="icon-sm"></i> Installed</span><button class="skill-btn use" onclick="event.stopPropagation(); useSkill('${skill.id}')">Use</button>` : `<button class="skill-btn install" onclick="event.stopPropagation(); installAndUseSkill('${skill.id}', this)"><i data-lucide="download" class="icon-sm"></i> Install & Use</button>`}
          }
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

/**
 * 安装技能
 */
// ===== 切换技能库 Tab =====
function switchSkillTab(tabId) {
  currentSkillTab = tabId;

  // 更新 Tab active 状态
  document.querySelectorAll('.skill-tab-item').forEach(item => {
    item.classList.remove('active');

    // 修复 onclick 属性中的 tabId
    const onclick = item.getAttribute('onclick');
    if (onclick) {
      const match = onclick.match(/switchSkillTab\('([^']+)'\)/);
      if (match && match[1] === tabId) {
        item.classList.add('active');
      }
    }
  });

  // 根据 Tab 加载数据
  loadCurrentTabData();
}

// ===== 加载当前 Tab 的数据 =====
async function loadCurrentTabData() {
  if (currentSkillTab === 'local') {
    loadLocalSkills();
  } else if (currentSkillTab === 'popular') {
    loadPopularSkills();
  }
}

// ===== 加载本地技能 =====
async function loadLocalSkills() {
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;

  try {
    // 获取已安装技能
    const installedRes = await fetch(`${API_BASE}/api/skills/installed`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    let installedSkills = [];
    let installedSet = new Set();

    if (installedRes.ok) {
      const installedData = await installedRes.json();
      installedSkills = installedData.skills || [];
      installedSet = new Set(installedSkills.map(s => s.id));
    }

    // 本地技能 = 已安装的技能
    // 如果没有已安装技能，显示空状态
    if (installedSkills.length === 0) {
      const container = document.getElementById('skillGrid');
      if (container) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#6e6e80;"><i data-lucide="package" style="width:48px;height:48px;margin-bottom:16px;color:#d1d5db;"></i><p>暂无已安装的技能</p><p style="font-size:12px;margin-top:8px;">从"热门技能"中安装技能吧！</p></div>';
        if (window.lucide) lucide.createIcons();
      }

      const titleEl = document.getElementById('skillGroupTitle');
      if (titleEl) {
        titleEl.innerHTML = '<i data-lucide="package" class="icon-sm icon-primary"></i> 本地技能 (0)';
      }
      return;
    }

    // 渲染已安装的技能
    renderSkills(installedSkills, installedSet, 'local');

    // 更新标题
    const titleEl = document.getElementById('skillGroupTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i data-lucide="package" class="icon-sm icon-primary"></i> 本地技能 (${installedSkills.length})`;
    }

  } catch (error) {
    console.error('加载本地技能失败:', error);
  }
}

// ===== 加载热门技能 =====
async function loadPopularSkills() {
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;
  try {
    // 热门技能从本地技能库获取（library.json 已筛选精品）
    const res = await fetch(`${API_BASE}/api/skills/library`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      popularSkillsCache = data.skills || [];

      // 获取已安装技能列表
      const installedRes = await fetch(`${API_BASE}/api/skills/installed`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      let installedSet = new Set();
      if (installedRes.ok) {
        const installedData = await installedRes.json();
        installedSet = new Set((installedData.skills || []).map(s => s.id));
      }

      renderPopularSkills(popularSkillsCache, installedSet);
      document.getElementById('skillGroupTitle').innerHTML = '<i data-lucide="star" class="icon-sm icon-primary"></i> 热门技能';
    }
  } catch (error) {
    console.error('加载热门技能失败:', error);
  }
}

// ===== 渲染本地技能 =====
function renderSkills(skills, installedSet, source = 'local') {
  const container = document.getElementById('skillGrid');
  if (!container) return;

  if (skills.length === 0) {
    container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#6e6e80;"><i data-lucide="package" style="width:48px;height:48px;margin-bottom:16px;color:#d1d5db;"></i><p>暂无技能</p></div>';
    if (window.lucide) lucide.createIcons();
    return;
  }

  const agentMap = {
    coder: { name: '云溪', icon: 'code', color: _accent() },
    ops: { name: '若曦', icon: 'bar-chart-2', color: '#f59e0b' },
    inventor: { name: '紫萱', icon: 'lightbulb', color: '#8b5cf6' },
    pm: { name: '梓萱', icon: 'target', color: '#06b6d4' },
    noter: { name: '晓琳', icon: 'file-text', color: '#ef4444' },
    media: { name: '音韵', icon: 'palette', color: '#ec4899' },
    smart: { name: '智家', icon: 'home', color: '#3b82f6' },
    lingxi: { name: '灵犀', icon: 'zap', color: _accent() }
  };

  const getAgentColor = (agent) => agentMap[agent]?.color || _accent();

  container.innerHTML = skills.map(skill => {
    const isInstalled = installedSet.has(skill.id);
    const agent = skill.agent || 'lingxi';
    const agentColor = getAgentColor(agent);
    const agentInfo = agentMap[agent] || agentMap.lingxi;

    return `
      <div class="skill-card" onclick="handleSkillClick('${skill.id}')">
        <div class="skill-header">
          <div class="skill-icon" style="background:${agentColor}">
            <i data-lucide="${agentInfo.icon}" style="width:24px;height:24px;color:white;"></i>
          </div>
          <div class="skill-info">
            <div class="skill-name">${skill.name || skill.id}</div>
            <div class="skill-desc">${skill.desc || skill.description || ''}</div>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <span class="skill-agent-tag"><i data-lucide="user" class="icon-sm"></i> ${skill.agent || '通用'}</span>
              ${source === 'local'
                ? `<span class="skill-source-tag" style="background:${_accentSoft()};color:${_accent()};"><i data-lucide="database" class="icon-sm"></i> 本地</span>`
                : `<span class="skill-source-tag skill-source-hot"><i data-lucide="star" class="icon-sm"></i> 热门</span>`
              }
            </div>
          </div>
        </div>
        <div class="skill-actions">
          ${isInstalled
            ? `<span class="skill-badge installed" onclick="event.stopPropagation();"><i data-lucide="check-circle" class="icon-sm"></i> Installed</span><button class="skill-btn use" onclick="event.stopPropagation(); useSkill('${skill.id}')">Use</button>`
            : `<button class="skill-btn install" onclick="event.stopPropagation(); installAndUseSkill('${skill.id}', this)"><i data-lucide="download" class="icon-sm"></i> Install & Use</button>`
          }
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ===== 渲染热门技能 =====
function renderPopularSkills(skills, installedSet) {
  const container = document.getElementById('skillGrid');
  if (!container) return;

  if (skills.length === 0) {
    container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#6e6e80;"><i data-lucide="package" style="width:48px;height:48px;margin-bottom:16px;color:#d1d5db;"></i><p>暂无技能</p></div>';
    if (window.lucide) lucide.createIcons();
    return;
  }

  const agentMap = {
    coder: { name: '云溪', icon: 'code', color: _accent() },
    ops: { name: '若曦', icon: 'bar-chart-2', color: '#f59e0b' },
    inventor: { name: '紫萱', icon: 'lightbulb', color: '#8b5cf6' },
    pm: { name: '梓萱', icon: 'target', color: '#06b6d4' },
    noter: { name: '晓琳', icon: 'file-text', color: '#ef4444' },
    media: { name: '音韵', icon: 'palette', color: '#ec4899' },
    smart: { name: '智家', icon: 'home', color: '#3b82f6' },
    lingxi: { name: '灵犀', icon: 'zap', color: _accent() }
  };

  const getAgentColor = (agent) => agentMap[agent]?.color || _accent();

  container.innerHTML = skills.map(skill => {
    const isInstalled = installedSet.has(skill.id);
    const agent = skill.agent || 'lingxi';
    const agentColor = getAgentColor(agent);
    const agentInfo = agentMap[agent] || agentMap.lingxi;

    return `
      <div class="skill-card" onclick="handleSkillClick('${skill.id}')">
        <div class="skill-header">
          <div class="skill-icon" style="background:${agentColor}">
            <i data-lucide="${agentInfo.icon}" style="width:24px;height:24px;color:white;"></i>
          </div>
          <div class="skill-info">
            <div class="skill-name">${skill.name || skill.id}</div>
            <div class="skill-desc">${skill.desc || skill.description || ''}</div>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <span class="skill-agent-tag"><i data-lucide="user" class="icon-sm"></i> ${skill.agent || '通用'}</span>
              <span class="skill-source-tag skill-source-hot"><i data-lucide="star" class="icon-sm"></i> 热门</span>
            </div>
          </div>
        </div>
        <div class="skill-actions">
          ${isInstalled
            ? `<span class="skill-badge installed" onclick="event.stopPropagation();"><i data-lucide="check-circle" class="icon-sm"></i> Installed</span><button class="skill-btn use" onclick="event.stopPropagation(); useSkill('${skill.id}')">Use</button>`
            : `<button class="skill-btn install" onclick="event.stopPropagation(); installAndUseSkill('${skill.id}', this)"><i data-lucide="download" class="icon-sm"></i> Install & Use</button>`
          }
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ===== 安装本地技能 =====

// ========== 技能安装 + 使用 ==========

/**
 * 一键使用技能（已安装）
 * 跳转聊天 → 填入 @agent + 技能示例
 */
function useSkill(skillId) {
  // 从技能缓存中找到技能信息
  const skill = findSkillById(skillId);
  if (!skill) return;

  // 关闭技能库面板
  closeSkillLibrary();

  // 切换到聊天输入
  const input = document.getElementById('inputField');
  if (!input) return;

  // 构造使用消息
  const exampleText = skill.example || skill.description || `使用技能 ${skill.name}`;
  input.value = exampleText;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  // 触发输入框自动增高
  input.dispatchEvent(new Event('input'));
}

/**
 * 一键安装并使用技能（未安装）
 * 1. 通过 chat.send RPC 让 Agent 执行 clawhub install
 * 2. 安装完成后跳转聊天填入示例
 */
async function installAndUseSkill(skillId, btnElement) {
  const skill = findSkillById(skillId);
  if (!skill) return;

  const btn = btnElement;
  const originalHTML = btn?.innerHTML || '';
  
  // 更新按钮状态
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:4px"></span> Installing...';
  }

  try {
    const token = localStorage.getItem('lingxi_token');
    
    // 调用后端 API 安装技能（后端通过 chat.send RPC 让 Agent 执行 clawhub install）
    const res = await fetch(`${API_BASE}/api/skills/install-and-use`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        skillId,
        skillName: skill.name || skillId
      })
    });

    const data = await res.json();
    
    if (data.success) {
      // 更新本地安装状态
      installedSkills.add(skillId);
      
      // 关闭技能库面板
      closeSkillLibrary();

      // 跳转聊天 → 填入使用示例
      const input = document.getElementById('inputField');
      if (input) {
        const exampleText = skill.example || skill.description || `使用技能 ${skill.name}`;
        input.value = exampleText;
        input.focus();
        input.dispatchEvent(new Event('input'));
      }
      
      showToast('✅ Skill installed!');
    } else {
      // 安装失败 → 退而求其次，填入安装指令让用户自己发
      closeSkillLibrary();
      const input = document.getElementById('inputField');
      if (input) {
        input.value = `请使用 clawhub 安装技能 "${skill.name || skillId}"`;
        input.focus();
        input.dispatchEvent(new Event('input'));
      }
      showToast('⚠️ ' + (data.error || 'Install failed, please try manually'));
    }
  } catch (err) {
    console.error('Install skill error:', err);
    // 网络错误 → 填入手动安装指令
    closeSkillLibrary();
    const input = document.getElementById('inputField');
    if (input) {
      input.value = `请使用 clawhub 安装技能 "${skill.name || skillId}"`;
      input.focus();
      input.dispatchEvent(new Event('input'));
    }
    showToast('⚠️ Network error, please install manually');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }
}

/**
 * 在技能缓存中查找技能
 */
function findSkillById(skillId) {
  // 搜索所有缓存
  const allCaches = [localSkillsCache, popularSkillsCache, clawHubSkillsCache];
  for (const cache of allCaches) {
    if (!cache) continue;
    for (const skill of cache) {
      if (skill.id === skillId) return skill;
    }
  }
  return { id: skillId, name: skillId, description: `Use skill ${skillId}`, example: `Use skill ${skillId}` };
}

// 保留旧函数名兼容
function installSkill(skillId, btnElement) {
  return installAndUseSkill(skillId, btnElement);
}

window.installSkill = installSkill;
window.useSkill = useSkill;
window.installAndUseSkill = installAndUseSkill;
// 初始化时渲染 agent 下拉
function initAgentDropdown() {
  console.log('🎯 initAgentDropdown 调用，user:', user);
  
  // 优先使用 user.team.members
  if (user?.team?.members && user.team.members.length > 0) {
    userAgentList = user.team.members.map(m => m.id);
    currentAgentId = userAgentList.includes('lingxi') ? 'lingxi' : userAgentList[0];
    
    const currentMember = user.team.members.find(m => m.id === currentAgentId);
    const agent = currentMember || ALL_AGENTS[currentAgentId] || AGENT_INFO[currentAgentId];
    if (agent) {
      const iconEl = document.getElementById('currentAgentIcon');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', agent.icon || 'bot');
        if (window.lucide) lucide.createIcons();
      }
    }
  } else if (user?.agents && user.agents.length > 0) {
    userAgentList = user.agents;
    currentAgentId = userAgentList.includes('lingxi') ? 'lingxi' : userAgentList[0];
    
    const agent = ALL_AGENTS[currentAgentId] || AGENT_INFO[currentAgentId];
    if (agent) {
      const iconEl = document.getElementById('currentAgentIcon');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', agent.icon || 'bot');
        if (window.lucide) lucide.createIcons();
      }
    }
  }
  
  console.log('🎯 userAgentList:', userAgentList);
  renderAgentDropdown();
}

// ==================== 使用量统计 ====================

// 显示使用量统计弹窗

window.setSidebarCreditsDisplay = setSidebarCreditsDisplay;
window.renderWelcomeHome = renderWelcomeHome;
window.hideWelcomeHome = hideWelcomeHome;
window.isMobileChatUi = isMobileChatUi;
window.resolveInitialSession = resolveInitialSession;
window.updateMobileSessionsState = updateMobileSessionsState;

// 刷新侧边栏积分显示
async function refreshSidebarCredits() {
  try {
    const token = localStorage.getItem('lingxi_token');
    console.log('🔄 刷新积分, token:', token ? token.substring(0, 20) + '...' : 'null');

    const response = await fetch('/api/user/credits', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await response.json();
    console.log('📊 积分API返回:', result);

    if (result.success && result.data) {
      setSidebarCreditsDisplay(result.data.total);
      console.log('侧边栏积分已更新:', result.data.total);
      return;
    }
  } catch (e) {
    console.error('刷新积分失败:', e);
  }
  // 回退：使用 /me 中的 points（邀请积分体系）
  try {
    const user = JSON.parse(localStorage.getItem('lingxi_user') || '{}');
    if (user.points) setSidebarCreditsDisplay(user.points);
  } catch (_) {}
}

async function showUsageStats() {
  // 关闭用户菜单
  document.getElementById('sidebarUserMenu').classList.remove('show');

  // 显示弹窗
  document.getElementById('usageStatsModal').classList.add('show');

  // 加载数据
  await loadUsageStats();
}

// 关闭使用量统计弹窗
function closeUsageStatsModal() {
  document.getElementById('usageStatsModal').classList.remove('show');
}

// 加载使用量数据
async function loadUsageStats() {
  try {
    const token = localStorage.getItem('lingxi_token');
    const response = await fetch('/api/user/usage', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (result.success) {
      renderUsageStats(result.data);
    } else {
      console.error('获取使用量失败:', result.error);
      showUsageError();
    }
  } catch (error) {
    console.error('获取使用量失败:', error);
    showUsageError();
  }
}

// 渲染使用量统计
// 格式化 token 数量
function formatTokens(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function renderUsageStats(data) {
  // 更新积分显示
  if (data.credits) {
    const total = data.credits.balance + data.credits.freeRemaining;
    // 动态最大值：购买积分 + 每日免费额度
    const maxCredits = data.credits.balance > 0
      ? data.credits.balance + data.credits.freeDaily
      : data.credits.freeDaily;
    const percent = Math.min((total / maxCredits) * 100, 100);

    // 更新百分比和总积分
    document.getElementById('creditsPercent').textContent = Math.round(percent) + '%';
    document.getElementById('totalCreditsDisplay').textContent = total.toLocaleString();
    document.getElementById('balanceCredits').textContent = data.credits.balance.toLocaleString();
    document.getElementById('freeCredits').textContent = `${data.credits.freeRemaining} / ${data.credits.freeDaily}`;

    // 更新进度条
    const bar = document.getElementById('quotaBar');
    if (bar) {
      bar.style.width = percent + '%';
      bar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
    }

    // 计算预计可用 tokens（假设使用阿里云或智谱，0.3 积分/1K tokens）
    const estimatedTokens = Math.floor(total / 0.3 * 1000);
    const estimatedK = Math.floor(estimatedTokens / 1000);
    const estimatedM = Math.floor(estimatedK / 1000);

    if (estimatedM > 0) {
      document.getElementById('estimatedTokens').textContent = `约 ${estimatedM}万 tokens`;
    } else {
      document.getElementById('estimatedTokens').textContent = `约 ${estimatedK}K tokens`;
    }
  }

  // 更新 Token 使用量卡片
  document.getElementById('todayTokens').textContent = formatTokens(data.today.tokens);
  document.getElementById('todayRequests').textContent = data.today.requests + ' 次';

  document.getElementById('weekTokens').textContent = formatTokens(data.week.tokens);
  document.getElementById('weekRequests').textContent = data.week.requests + ' 次';

  document.getElementById('monthTokens').textContent = formatTokens(data.month.tokens);
  document.getElementById('monthRequests').textContent = data.month.requests + ' 次';

  document.getElementById('totalTokens').textContent = formatTokens(data.totalTokens);
  document.getElementById('totalRequests').textContent = data.totalRequests + ' 次';

  // 渲染模型统计

  // 渲染趋势图
}

// 渲染模型统计

// 渲染趋势图

// 显示错误
function showUsageError() {
}

// 点击弹窗外部关闭
document.addEventListener('click', (e) => {
  if (e.target.id === 'usageStatsModal') {
    closeUsageStatsModal();
  }
});


// ===== 语音输入功能 =====

let recognition = null;
let isRecording = false;

// 初始化语音识别
function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.log('[语音] 浏览器不支持语音识别');
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
      voiceBtn.style.display = 'none';
    }
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;      // 持续识别
  recognition.interimResults = true;  // 实时显示结果
  recognition.lang = 'zh-CN';         // 中文识别
  recognition.maxAlternatives = 1;    // 只返回最佳结果

  // 实时结果
  recognition.onresult = (event) => {
    console.log('[语音] 收到识别结果，resultIndex:', event.resultIndex, 'results数量:', event.results.length);

    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      console.log('[语音] 结果', i, '- isFinal:', event.results[i].isFinal, '内容:', transcript);

      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    const inputField = document.getElementById('inputField');
    if (inputField) {
      // 如果有最终结果，追加到输入框
      if (finalTranscript) {
        console.log('[语音] 最终结果:', finalTranscript);
        // 🆕 添加语音标记（用于触发语音回复）
        inputField.value = '🎤 ' + finalTranscript;
        // 触发输入事件，让输入框自动调整高度
        inputField.dispatchEvent(new Event('input'));
      }
      // 如果有临时结果，直接显示在输入框中
      if (interimTranscript) {
        console.log('[语音] 临时结果:', interimTranscript);
        // 在光标位置显示临时结果
        const currentValue = inputField.value;
        inputField.value = currentValue + interimTranscript;
      }
    } else {
      console.error('[语音] 找不到输入框元素');
    }
  };

  // 错误处理
  recognition.onerror = async (event) => {
    console.error('[语音] 识别错误:', event.error);
    if (event.error === 'not-allowed') {
      await uiAlert('请允许浏览器访问麦克风');
    } else if (event.error === 'no-speech') {
      console.log('[语音] 未检测到语音');
    }
    stopRecording();
  };

  // 识别结束
  recognition.onend = () => {
    console.log('[语音] 识别结束，isRecording:', isRecording);

    // 不自动重启，让用户手动控制
    // 如果需要持续录音，用户应该保持点击状态

    // 重置状态
    if (!isRecording) {
      const voiceBtn = document.getElementById('voiceBtn');
      const inputField = document.getElementById('inputField');

      if (voiceBtn) {
        voiceBtn.classList.remove('recording');
        voiceBtn.innerHTML = '<i data-lucide="mic" class="icon-sm"></i>';
        if (window.lucide) lucide.createIcons();
      }

      if (inputField) {
        inputField.placeholder = '输入消息...';
      }
    }
  };

  // 开始识别
  recognition.onstart = () => {
    console.log('[语音] 识别服务已启动');
  };

  // 音频开始
  recognition.onaudiostart = () => {
    console.log('[语音] 检测到音频输入');
  };

  // 音频结束
  recognition.onaudioend = () => {
    console.log('[语音] 音频输入结束');
  };
}

// 切换录音状态（改为按住说话模式）
async function toggleVoiceInput() {
  if (!recognition) {
    await uiAlert('您的浏览器不支持语音识别，请使用 Chrome、Edge 或 Safari 浏览器');
    return;
  }

  // 🆕 改为按住说话模式（不再 toggle）
  if (!isRecording) {
    startRecording();
  }
}

// 🆕 添加停止录音并自动发送
function stopRecordingAndSend() {
  if (!recognition || !isRecording) return;

  isRecording = false;

  try {
    recognition.stop();
  } catch (e) {
    console.error('[语音] 停止失败:', e.message);
  }

  const voiceBtn = document.getElementById('voiceBtn');
  const inputField = document.getElementById('inputField');

  if (voiceBtn) {
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '<i data-lucide="mic" class="icon-sm"></i>';
    if (window.lucide) lucide.createIcons();
  }

  if (inputField) {
    inputField.placeholder = '输入消息...';
    
    // 🆕 自动发送消息
    const message = inputField.value.trim();
    if (message) {
      console.log('[语音] 自动发送消息:', message);
      // 触发发送按钮点击
      const sendBtn = document.getElementById('sendBtn');
      if (sendBtn) {
        sendBtn.click();
      }
    }
    
    // 清除临时文本
    inputField.removeAttribute('data-interim');
  }

  console.log('[语音] 停止录音并自动发送');
}

// 开始录音
function startRecording() {
  if (!recognition) return;

  try {
    isRecording = true;

    // 检查是否已经在运行
    if (recognition.running) {
      console.log('[语音] 语音识别已在运行');
      return;
    }

    recognition.start();

    const voiceBtn = document.getElementById('voiceBtn');
    const inputField = document.getElementById('inputField');

    if (voiceBtn) {
      voiceBtn.classList.add('recording');
      voiceBtn.innerHTML = '<i data-lucide="mic-off" class="icon-sm"></i>';
      if (window.lucide) lucide.createIcons();
    }

    if (inputField) {
      inputField.placeholder = '正在录音，请说话...';
    }

    console.log('[语音] 开始录音');
  } catch (e) {
    console.error('[语音] 启动失败:', e.message);
    isRecording = false;
    // 重置按钮状态
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
      voiceBtn.classList.remove('recording');
      voiceBtn.innerHTML = '<i data-lucide="mic" class="icon-sm"></i>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

// 停止录音
function stopRecording() {
  if (!recognition) return;

  isRecording = false;

  try {
    recognition.stop();
  } catch (e) {
    console.error('[语音] 停止失败:', e.message);
  }

  const voiceBtn = document.getElementById('voiceBtn');
  const inputField = document.getElementById('inputField');

  if (voiceBtn) {
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '<i data-lucide="mic" class="icon-sm"></i>';
    if (window.lucide) lucide.createIcons();
  }

  if (inputField) {
    inputField.placeholder = '输入消息...';
    // 清除临时文本
    inputField.removeAttribute('data-interim');
  }

  console.log('[语音] 停止录音');
}

// 页面加载时初始化语音识别
document.addEventListener('DOMContentLoaded', () => {
  initVoiceRecognition();

  // 监听输入框文字变化，动态切换按钮显示（豆包风格）
  const inputField = document.getElementById('inputField');
  if (inputField) {
    inputField.addEventListener('input', updateInputButtons);
    // 初始化时也调用一次
    updateInputButtons();
  }
});

// 更新输入框右侧按钮显示（豆包风格：有文字显示发送，无文字显示麦克风+上传）
function updateInputButtons() {
  const inputField = document.getElementById('inputField');
  const sendBtn = document.getElementById('sendBtn');
  if (!inputField || !sendBtn) return;

  const inputRightBtns = document.getElementById('inputRightBtns');
  const hasText = inputField.value.trim().length > 0;
  const hasImage = document.getElementById('imagePreviewContainer')?.classList.contains('show');
  const hasTags = (document.getElementById('skillTagsArea')?.children.length || 0) > 0;
  const canSend = hasText || hasImage || hasTags;

  if (canSend) {
    sendBtn.classList.remove('hidden');
    sendBtn.disabled = false;
    if (inputRightBtns) inputRightBtns.classList.add('hidden');
  } else {
    sendBtn.classList.add('hidden');
    if (inputRightBtns) inputRightBtns.classList.remove('hidden');
  }
}

window.updateInputButtons = updateInputButtons;

// 拍照功能（调用摄像头）
async function handleCameraCapture() {
  try {
    // 创建隐藏的 input 元素
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';  // 使用后置摄像头

    input.onchange = (event) => {
      const file = event.target.files[0];
      if (file) {
        // 复用 handleImageSelect 的逻辑
        const fakeEvent = { target: { files: [file] } };
        handleImageSelect(fakeEvent);
      }
    };

    input.click();
  } catch (error) {
    console.error('打开摄像头失败:', error);
    await uiAlert('无法打开摄像头，请检查权限设置');
  }
}

// ============ 通知模块 ============

let _notificationUnreadCount = 0;

/** 加载未读通知数量（页面初始化时调用） */
async function loadNotificationUnreadCount() {
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/healthcheck/notifications/unread-count`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      _notificationUnreadCount = data.count;
      updateNotificationBadge();
    }
  } catch (e) {
    console.error('[通知] 获取未读数失败:', e);
  }
}

/** 更新铃铛上的 badge */
function updateNotificationBadge() {
  const text = _notificationUnreadCount > 9 ? '9+' : String(_notificationUnreadCount);
  const show = _notificationUnreadCount > 0;
  ['notificationBadge', 'mobileNotificationBadge'].forEach((id) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (show) {
      badge.textContent = text;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  });
}

/** 切换通知面板显示/隐藏 */
async function toggleNotificationPanel(event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById('notificationPanel');
  if (!panel) return;

  const isVisible = panel.style.display !== 'none';
  if (isVisible) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  await loadNotificationList();
}

/** 加载通知列表 */
async function loadNotificationList() {
  const token = localStorage.getItem('lingxi_token');
  const body = document.getElementById('notificationPanelBody');
  const markAllBtn = document.getElementById('notificationMarkAll');
  if (!body || !token) return;

  body.innerHTML = '<div class="notification-empty">加载中...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/healthcheck/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) {
      body.innerHTML = '<div class="notification-empty">加载失败</div>';
      return;
    }

    const notifs = data.data || [];
    if (notifs.length === 0) {
      body.innerHTML = '<div class="notification-empty">暂无通知</div>';
      if (markAllBtn) markAllBtn.style.display = 'none';
      return;
    }

    const hasUnread = notifs.some(n => !n.read);
    if (markAllBtn) markAllBtn.style.display = hasUnread ? '' : 'none';

    body.innerHTML = notifs.map(n => {
      // 根据 type 决定图标和 bar 颜色
      let barClass = 'recovered';
      let icon = '';
      if (n.type === 'reminder') {
        barClass = 'reminder';
        icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;margin-right:4px;color:${_accent()}"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      } else if (n.type === 'server_offline') {
        barClass = 'offline';
        icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;margin-right:4px;color:#f5576c"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
      } else if (n.type === 'server_recovered') {
        barClass = 'recovered';
        icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;margin-right:4px;color:#43e97b"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
      }
      const unreadClass = n.read ? '' : 'is-unread';
      return `<div class="notification-item ${unreadClass}" onclick="markNotificationRead('${n.id}', this)">
        <div class="notification-item-bar ${barClass}"></div>
        <div class="notification-item-content">
          <div class="notification-item-msg" style="display:flex;align-items:flex-start">${icon}${escapeHtml(n.message || '')}</div>
          <div class="notification-item-time">${formatRelativeTime(n.createdAt)}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    console.error('[通知] 加载列表失败:', e);
    body.innerHTML = '<div class="notification-empty">加载失败</div>';
  }
}

/** 标记单条通知已读 */
async function markNotificationRead(notifId, el) {
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/api/healthcheck/notifications/read`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ notificationId: notifId })
    });
    const data = await res.json();
    if (data.success) {
      if (el) el.classList.remove('is-unread');
      _notificationUnreadCount = Math.max(0, _notificationUnreadCount - 1);
      updateNotificationBadge();
      // 检查是否还有未读
      const markAllBtn = document.getElementById('notificationMarkAll');
      const anyUnread = document.querySelector('.notification-item.is-unread');
      if (markAllBtn && !anyUnread) markAllBtn.style.display = 'none';
    }
  } catch (e) {
    console.error('[通知] 标记已读失败:', e);
  }
}

/** 标记全部已读 */
async function markAllNotificationsRead(event) {
  if (event) event.stopPropagation();
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/api/healthcheck/notifications/read`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ all: true })
    });
    const data = await res.json();
    if (data.success) {
      document.querySelectorAll('.notification-item.is-unread').forEach(el => {
        el.classList.remove('is-unread');
      });
      _notificationUnreadCount = 0;
      updateNotificationBadge();
      const markAllBtn = document.getElementById('notificationMarkAll');
      if (markAllBtn) markAllBtn.style.display = 'none';
    }
  } catch (e) {
    console.error('[通知] 全部已读失败:', e);
  }
}

/** 相对时间格式化 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diff = now - then;
  if (diff < 0) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days/7)}w ago`;
  const d = new Date(then);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

/** HTML 转义 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 点击页面其他区域关闭通知面板
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notificationPanel');
  const bell = document.getElementById('notificationBell');
  const railNotif = document.getElementById('railNotifBtn');
  if (panel && panel.style.display !== 'none' && !panel.contains(e.target) && !bell?.contains(e.target) && !railNotif?.contains(e.target)) {
    panel.style.display = 'none';
  }
});

// 导出函数
window.openFileExplorerFromNav = openFileExplorerFromNav;
window.toggleTeamDrawer = toggleTeamDrawer;
window.toggleRightSidebar = toggleRightSidebar;
window.initTeamDrawer = initTeamDrawer;
window.initRightSidebar = initRightSidebar;
window.updateRightSidebarToggleUi = updateRightSidebarToggleUi;
window.updateScrollContextBar = updateScrollContextBar;
window.switchAgentFromDrawer = switchAgentFromDrawer;
window.sendFromTeamDrawer = sendFromTeamDrawer;
window.toggleNotificationPanel = toggleNotificationPanel;
window.markAllNotificationsRead = markAllNotificationsRead;
window.markNotificationRead = markNotificationRead;

// 导出函数
window.toggleVoiceInput = toggleVoiceInput;
window.handleCameraCapture = handleCameraCapture;

// 更新用户订阅徽章
function updateUserBadge() {
  const badgeEl = document.getElementById('sidebarUserBadge');
  if (!badgeEl || !user) return;

  const plan = user.subscription?.plan || 'free';
  const planNames = {
    'free': 'FREE',
    'lite': 'LITE',
    'pro': 'PRO'
  };

  badgeEl.textContent = planNames[plan] || 'FREE';
  badgeEl.className = `sidebar-user-badge ${plan}`;
  if (plan === 'free') {
    badgeEl.textContent = '';
  }

  // 更新头像文字
  const avatarEl = document.getElementById('sidebarUserAvatar');
  if (avatarEl && user.nickname) {
    avatarEl.textContent = user.nickname.charAt(0).toUpperCase();
  }

  // 更新用户名
  const nameEl = document.getElementById('sidebarUserName');
  if (nameEl && user.nickname) {
    nameEl.textContent = user.nickname;
  }
}

// 全局 ESC 键关闭弹窗
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const subModal = document.getElementById('subOnboardingModal');
  const obModal = document.getElementById('onboardingModal');
  if (subModal && subModal.style.display !== 'none') {
    dismissSubOnboarding();
  } else if (obModal && obModal.style.display !== 'none') {
    startChat();
  }
});
