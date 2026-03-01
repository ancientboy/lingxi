/**
 * 统一组件加载器
 */

async function loadComponent(containerId, componentPath) {
  try {
    const response = await fetch(componentPath);
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
  
  // 组件加载完成后再加载用户信息
  if (typeof loadUserInfo === 'function') {
    loadUserInfo();
  }
  
  console.log('✅ 聊天组件加载完成');
}

// 立即执行初始化（不依赖 DOMContentLoaded）
function initComponents() {
  const pageType = document.body.getAttribute('data-page');
  console.log('📄 Page type:', pageType);
  
  if (pageType === 'chat') {
    loadChatComponents();
  }
}

// 如果 DOM 已经加载完成，直接初始化；否则等待事件
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initComponents);
} else {
  // DOM 已就绪，直接执行
  initComponents();
}
