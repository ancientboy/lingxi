// 领取团队模块 - 添加到 index.html

// Agent 信息
const AGENT_INFO = {
  lingxi: { emoji: '⚡', name: '灵犀', desc: '队长 · 智能调度', required: true },
  coder: { emoji: '💻', name: '云溪', desc: '编程开发' },
  ops: { emoji: '📊', name: '若曦', desc: '数据分析' },
  inventor: { emoji: '💡', name: '紫萱', desc: '内容创意' },
  pm: { emoji: '🎯', name: '梓萱', desc: '产品设计' },
  noter: { emoji: '📝', name: '晓琳', desc: '知识管理' },
  media: { emoji: '🎨', name: '音韵', desc: '多媒体创作' },
  smart: { emoji: '🏠', name: '智家', desc: '智能工具' }
};

// 选中的 Agent
let selectedAgents = ['lingxi', 'coder', 'ops', 'inventor'];

// 显示领取团队弹窗
function showClaimTeamModal() {
  // 创建弹窗
  const modal = document.createElement('div');
  modal.id = 'claimTeamModal';
  modal.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div style="background: white; border-radius: 16px; max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto;">
        <div style="padding: 24px; border-bottom: 1px solid #e5e5e5;">
          <h2 style="font-size: 20px; margin: 0;">选择你的 AI 团队</h2>
          <p style="color: #6e6e80; font-size: 14px; margin: 8px 0 0;">选择你需要的成员（至少3个）</p>
        </div>
        
        <div style="padding: 20px;">
          <div id="agentSelectGrid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${Object.entries(AGENT_INFO).map(([id, agent]) => `
              <div class="agent-select-item ${selectedAgents.includes(id) ? 'selected' : ''}" 
                   data-agent="${id}" 
                   onclick="toggleAgentSelection('${id}')"
                   style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid ${selectedAgents.includes(id) ? '#10a37f' : '#e5e5e5'}; border-radius: 12px; cursor: pointer; transition: all 0.2s; ${selectedAgents.includes(id) ? 'background: rgba(16,163,127,0.1);' : ''}">
                <span style="font-size: 32px;">${agent.emoji}</span>
                <div style="flex: 1;">
                  <div style="font-weight: 600;">${agent.name}</div>
                  <div style="font-size: 12px; color: #6e6e80;">${agent.desc}</div>
                </div>
                ${agent.required ? '<span style="font-size: 10px; color: #10a37f; background: rgba(16,163,127,0.1); padding: 2px 6px; border-radius: 4px;">队长</span>' : ''}
              </div>
            `).join('')}
          </div>
          
          <div style="margin-top: 16px; padding: 12px; background: #f4f4f4; border-radius: 8px; font-size: 13px; color: #6e6e80;">
            已选择 <span id="selectedCount">${selectedAgents.length}</span> 个成员
          </div>
        </div>
        
        <div style="padding: 20px; border-top: 1px solid #e5e5e5; display: flex; gap: 12px;">
          <button onclick="closeClaimTeamModal()" style="flex: 1; padding: 14px; border: 1px solid #e5e5e5; border-radius: 10px; background: white; font-size: 16px; cursor: pointer;">取消</button>
          <button onclick="confirmClaimTeam()" id="confirmClaimBtn" style="flex: 1; padding: 14px; border: none; border-radius: 10px; background: #10a37f; color: white; font-size: 16px; cursor: pointer;">确认领取</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .agent-select-item:hover { border-color: #10a37f !important; }
    .agent-select-item.selected { border-color: #10a37f !important; background: rgba(16,163,127,0.1) !important; }
  `;
  document.head.appendChild(style);
}

// 关闭弹窗
function closeClaimTeamModal() {
  const modal = document.getElementById('claimTeamModal');
  if (modal) modal.remove();
}

// 切换 Agent 选择
function toggleAgentSelection(agentId) {
  const agent = AGENT_INFO[agentId];
  
  // 队长不能取消
  if (agent.required) return;
  
  if (selectedAgents.includes(agentId)) {
    // 至少保留3个
    if (selectedAgents.length <= 3) {
      alert('至少需要选择3个成员');
      return;
    }
    selectedAgents = selectedAgents.filter(id => id !== agentId);
  } else {
    selectedAgents.push(agentId);
  }
  
  // 更新 UI
  updateAgentSelectUI();
}

// 更新选择 UI
function updateAgentSelectUI() {
  document.querySelectorAll('.agent-select-item').forEach(el => {
    const agentId = el.dataset.agent;
    const isSelected = selectedAgents.includes(agentId);
    el.className = `agent-select-item ${isSelected ? 'selected' : ''}`;
    el.style.borderColor = isSelected ? '#10a37f' : '#e5e5e5';
    el.style.background = isSelected ? 'rgba(16,163,127,0.1)' : 'white';
  });
  
  document.getElementById('selectedCount').textContent = selectedAgents.length;
}

// 确认领取
async function confirmClaimTeam() {
  const btn = document.getElementById('confirmClaimBtn');
  btn.disabled = true;
  btn.textContent = '领取中...';
  
  const token = localStorage.getItem('lingxi_token');
  
  try {
    // 显示进度
    showProgressModal();
    updateProgress(5, '正在验证积分...');
    
    const res = await fetch(`${API_BASE}/api/auth/claim-team`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ agents: selectedAgents })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || '领取失败');
    }
    
    // 检查返回状态
    if (data.status === 'ready' && data.openclawUrl) {
      // 直接可以访问（已有服务器或 MVP 模式）
      updateProgress(100, '领取成功！');
      await sleep(1000);
      
      // 更新本地用户信息
      localStorage.setItem('lingxi_user', JSON.stringify({
        ...JSON.parse(localStorage.getItem('lingxi_user') || '{}'),
        agents: data.agents,
        openclawUrl: data.openclawUrl
      }));
      
      closeClaimTeamModal();
      closeProgressModal();
      
      // 直接跳转到聊天
      window.location.href = 'chat.html';
      return;
    }
    
    // 需要轮询部署状态
    if (data.status === 'deploying' && data.taskId) {
      updateProgress(5, '正在初始化...');
      await pollDeployStatus(data.taskId, data.agents);
      return;
    }
    
    // 未知状态
    throw new Error('未知返回状态');
    
  } catch (err) {
    closeProgressModal();
    btn.disabled = false;
    btn.textContent = '确认领取';
    alert(err.message);
  }
}

// 轮询部署状态
async function pollDeployStatus(taskId, agents) {
  const maxPolls = 180; // 最多轮询 3 分钟（每秒一次）
  
  for (let i = 0; i < maxPolls; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/deploy/task/${taskId}`);
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || '查询部署状态失败');
      }
      
      const task = data.task;
      // 直接使用后端进度，不再做转换
      const progress = Math.min(Math.max(task.progress, 0), 100);
      
      // 根据进度更新提示（与后端 deploy.js 保持一致）
      let statusText = '正在部署...';
      if (progress < 5) statusText = '正在验证信息...';
      else if (progress < 10) statusText = '正在生成配置包...';
      else if (progress < 20) statusText = '正在创建云服务器...';
      else if (progress < 60) statusText = '等待服务器启动...';
      else if (progress < 65) statusText = '等待 SSH 就绪...';
      else if (progress < 70) statusText = '正在上传部署包...';
      else if (progress < 95) statusText = '正在安装 OpenClaw...';
      else if (progress < 100) statusText = '验证服务状态...';
      else statusText = '部署完成！';
      
      updateProgress(progress, statusText);
      
      // 部署失败
      if (task.status === 'failed') {
        throw new Error(task.errorMessage || '部署失败');
      }
      
      // 部署完成
      if (task.status === 'success' && task.result) {
        const result = typeof task.result === 'string' ? JSON.parse(task.result) : task.result;
        
        updateProgress(100, '领取成功！');
        await sleep(1000);
        
        // 更新本地用户信息
        localStorage.setItem('lingxi_user', JSON.stringify({
          ...JSON.parse(localStorage.getItem('lingxi_user') || '{}'),
          agents: agents,
          openclawUrl: result.openclawUrl
        }));
        
        closeClaimTeamModal();
        closeProgressModal();
        
        // 跳转到聊天
        window.location.href = 'chat.html';
        return;
      }
      
      // 部署失败
      if (task.status === 'failed') {
        throw new Error(task.errorMessage || '部署失败');
      }
      
      // 继续等待
      await sleep(1000);
      
    } catch (err) {
      // 网络错误，继续重试
      console.error('轮询错误:', err);
      await sleep(1000);
    }
  }
  
  // 超时
  throw new Error('部署超时，请联系客服');
}

// 显示进度弹窗
function showProgressModal() {
  const modal = document.createElement('div');
  modal.id = 'progressModal';
  modal.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 2000; display: flex; align-items: center; justify-content: center;">
      <div style="background: white; border-radius: 16px; padding: 32px; text-align: center; min-width: 300px;">
        <div id="progressSpinner" style="width: 48px; height: 48px; border: 4px solid #e5e5e5; border-top-color: #10a37f; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
        <div id="progressText" style="font-size: 16px; margin-bottom: 12px;">正在处理...</div>
        <div style="background: #e5e5e5; border-radius: 8px; height: 8px; overflow: hidden;">
          <div id="progressBar" style="background: #10a37f; height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <div id="progressPercent" style="font-size: 14px; color: #6e6e80; margin-top: 8px;">0%</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 添加动画
  const style = document.createElement('style');
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

// 更新进度
function updateProgress(percent, text) {
  const bar = document.getElementById('progressBar');
  const percentEl = document.getElementById('progressPercent');
  const textEl = document.getElementById('progressText');
  
  if (bar) bar.style.width = `${percent}%`;
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (textEl) textEl.textContent = text;
}

// 关闭进度弹窗
function closeProgressModal() {
  const modal = document.getElementById('progressModal');
  if (modal) modal.remove();
}

// 辅助函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
