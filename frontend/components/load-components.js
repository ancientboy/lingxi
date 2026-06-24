/**
 * 统一组件加载器
 */

const COMPONENT_VERSION = '20260625d';

async function refreshChatSidebarAfterComponentsLoad() {
  if (!window.sessions?.length && typeof loadLumeSessions === 'function') {
    try {
      await loadLumeSessions();
    } catch (e) {
      console.warn('侧栏就绪后加载会话失败:', e);
    }
  }
  if (typeof loadSidebarSessions === 'function') {
    loadSidebarSessions();
  }

  const messagesEl = document.getElementById('messages');
  const hasChatMessages = messagesEl && messagesEl.querySelectorAll('.message').length > 0;
  const onlyWelcome = messagesEl && !hasChatMessages && (
    messagesEl.querySelector('#welcome') || document.getElementById('chatContainer')?.classList.contains('is-home')
  );

  if (onlyWelcome && window.USE_LUME && typeof LumeRpc !== 'undefined' && LumeRpc.isConnected()) {
    try {
      if (typeof resolveInitialSession === 'function') {
        await resolveInitialSession();
      } else if (typeof loadChatHistory === 'function') {
        await loadChatHistory();
      }
    } catch (e) {
      console.warn('侧栏加载后刷新历史失败:', e);
    }
  }
}

async function refreshSessionsForSidebar() {
  const todayEl = document.getElementById('todaySessions');
  if (todayEl) {
    todayEl.innerHTML = '<div class="session-empty session-loading">加载对话中…</div>';
  }
  if (typeof loadLumeSessions === 'function') {
    await loadLumeSessions();
  }
  if (typeof loadSidebarSessions === 'function') {
    loadSidebarSessions();
  }
}

window.refreshSessionsForSidebar = refreshSessionsForSidebar;

async function loadComponent(containerId, componentPath) {
  try {
    const url = componentPath + (componentPath.includes('?') ? '&' : '?') + 'v=' + COMPONENT_VERSION;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${componentPath}`);
    const html = await response.text();
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = html;
      if (window.lucide) lucide.createIcons();
    }
  } catch (error) {
    console.error(`Error loading component ${componentPath}:`, error);
  }
}

async function loadChatComponents() {
  console.log('🔧 加载聊天组件...');
  await loadComponent('navbar-container', 'components/navbar.html');
  await loadComponent('sidebar-container', 'components/sidebar.html');
  await loadComponent('right-rail-container', 'components/right-rail.html');
  
  if (typeof initTeamDrawer === 'function') initTeamDrawer();
  
  // 组件加载完成后再加载用户信息
  if (typeof loadUserInfo === 'function') {
    loadUserInfo();
  }
  
  // 检查 LumeClaw 权限（侧边栏加载完成后）
  if (typeof checkLumeclawAccess === 'function') {
    checkLumeclawAccess();
  }

  await refreshChatSidebarAfterComponentsLoad();
  
  console.log('✅ 聊天组件加载完成');
}

document.addEventListener('DOMContentLoaded', function() {
  const pageType = document.body.getAttribute('data-page');
  console.log('📄 Page type:', pageType);
  
  if (pageType === 'chat') {
    loadChatComponents();
  }
});
