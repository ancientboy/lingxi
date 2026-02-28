/**
 * 统一组件加载器
 * 动态加载 navbar 和 sidebar 组件
 */

// 加载组件
async function loadComponent(containerId, componentPath) {
  try {
    const response = await fetch(componentPath);
    if (!response.ok) throw new Error(`Failed to load ${componentPath}`);
    const html = await response.text();
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = html;
      // 重新初始化 Lucide 图标
      if (window.lucide) {
        lucide.createIcons();
      }
    }
  } catch (error) {
    console.error(`Error loading component ${componentPath}:`, error);
  }
}

// 加载对话页组件
async function loadChatComponents() {
  await loadComponent('navbar-container', 'components/navbar.html');
  await loadComponent('sidebar-container', 'components/sidebar.html');
}

// 加载技能库页组件
async function loadSkillsComponents() {
  await loadComponent('navbar-container', 'components/navbar-skills.html');
  await loadComponent('sidebar-container', 'components/sidebar-skills.html');
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
  const pageType = document.body.getAttribute('data-page');
  
  if (pageType === 'chat') {
    loadChatComponents();
  } else if (pageType === 'skills') {
    loadSkillsComponents();
  }
});
