/**
 * 统一组件加载器
 */

const COMPONENT_VERSION = '20260625a';

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
  
  console.log('✅ 聊天组件加载完成');
}

document.addEventListener('DOMContentLoaded', function() {
  const pageType = document.body.getAttribute('data-page');
  console.log('📄 Page type:', pageType);
  
  if (pageType === 'chat') {
    loadChatComponents();
  }
});
