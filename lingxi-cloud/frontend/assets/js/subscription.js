/**
 * 订阅管理模块 - 支付宝支付（支持电脑扫码 + 手机H5）
 */

// 显示订阅弹窗
window.showSubscription = function() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const userMenu = document.getElementById('sidebarUserMenu');
  if (userMenu) userMenu.classList.remove('show');
  
  const modal = document.getElementById('subscriptionModal');
  if (modal) {
    modal.classList.add('show');
    loadSubscriptionData();
  }
};

// 关闭订阅弹窗
window.closeSubscriptionModal = function() {
  const modal = document.getElementById('subscriptionModal');
  if (modal) modal.classList.remove('show');
};

// 加载订阅数据
async function loadSubscriptionData() {
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;
  
  try {
    const res = await fetch(API_BASE + '/api/subscription/current', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const result = await res.json();
    if (result.success) renderSubscriptionModal(result.data);
  } catch (e) {
    console.error('加载订阅数据失败:', e);
  }
}

// 渲染订阅弹窗
function renderSubscriptionModal(data) {
  const currentEl = document.getElementById('subCurrentStatus');
  const plansEl = document.getElementById('subPlansGrid');
  const packsEl = document.getElementById('subPacksGrid');
  if (!currentEl || !plansEl || !packsEl) return;
  
  const sub = data.subscription;
  const credits = data.credits || {};
  const balance = credits.balance || 0;
  const monthlyQuota = credits.monthlyQuota || 0;
  const freeDaily = credits.freeDaily || 0;
  const freeDailyUsed = credits.freeDailyUsed || 0;
  
  // 渲染当前状态
  if (sub && sub.plan !== 'free') {
    const usedPercent = monthlyQuota > 0 ? Math.round((balance / monthlyQuota) * 100) : 100;
    currentEl.innerHTML = '<div class="sub-current-title"><i data-lucide="crown" class="icon-sm"></i>' + (sub.planName || sub.plan) + '</div><div class="sub-current-info"><span><i data-lucide="coins" class="icon-xs"></i> 积分余额: ' + balance.toLocaleString() + ' / ' + monthlyQuota.toLocaleString() + '</span><span><i data-lucide="calendar" class="icon-xs"></i> ' + sub.startDate + ' ~ ' + sub.endDate + '</span><span><i data-lucide="clock" class="icon-xs"></i> ' + (data.remainingDays || 0) + ' 天后到期</span></div><div class="sub-progress-bar"><div class="sub-progress-fill" style="width: ' + usedPercent + '%"></div></div>';
    currentEl.className = 'sub-current';
  } else if (sub && sub.trialUsed) {
    if (data.trialStatus === 'active') {
      currentEl.innerHTML = '<div class="sub-current-title"><i data-lucide="gift" class="icon-sm"></i>免费试用中</div><div class="sub-current-info"><span><i data-lucide="coins" class="icon-xs"></i> 积分余额: ' + balance.toLocaleString() + '</span><span><i data-lucide="zap" class="icon-xs"></i> 今日剩余: ' + (freeDaily - freeDailyUsed) + ' / ' + freeDaily + '</span></div>';
    } else {
      currentEl.innerHTML = '<div class="sub-current-title"><i data-lucide="alert-circle" class="icon-sm"></i>试用已过期</div><div class="sub-current-info"><span>升级套餐继续使用</span></div>';
    }
    currentEl.className = 'sub-current free';
  } else {
    currentEl.innerHTML = '<div class="sub-current-title"><i data-lucide="user" class="icon-sm"></i>免费用户</div><div class="sub-current-info"><span><i data-lucide="coins" class="icon-xs"></i> 积分余额: ' + balance.toLocaleString() + '</span><span>开启 3 天免费试用</span></div>';
    currentEl.className = 'sub-current free';
  }
  
  // 渲染套餐
  const plans = data.plans || {};
  const currentPlan = sub?.plan || 'none';
  plansEl.innerHTML = Object.entries(plans).map(function([id, plan]) {
    const isCurrent = currentPlan === id;
    const features = [];
    if (plan.credits) features.push(plan.credits.toLocaleString() + ' 积分/月');
    else if (plan.dailyCredits) features.push('每日 ' + plan.dailyCredits + ' 积分');
    features.push(plan.serverType === 'dedicated' ? '独享服务器' : '共享服务器');
    if (plan.features?.models === 'all') features.push('全部模型');
    
    let btnText = '订阅', btnClass = '', btnDisabled = false;
    if (id === 'free') {
      btnText = sub?.trialUsed ? '已试用' : '开始试用';
      btnClass = 'trial';
      btnDisabled = sub?.trialUsed;
    } else if (isCurrent) {
      btnText = '续费';
      btnClass = 'current';
    }
    return '<div class="sub-plan-card ' + (isCurrent ? 'current' : '') + '"><div class="sub-plan-name">' + plan.name + '</div><div class="sub-plan-price">¥' + plan.price + '<span>/月</span></div><div class="sub-plan-features">' + features.map(function(f) { return '<div class="sub-plan-feature"><i data-lucide="check" class="icon-xs"></i>' + f + '</div>'; }).join('') + '</div><button class="sub-plan-btn ' + btnClass + '" onclick="handleSubscribe(\'' + id + '\')" ' + (btnDisabled ? 'disabled' : '') + '>' + btnText + '</button></div>';
  }).join('');
  
  // 渲染积分包
  packsEl.innerHTML = (data.creditPacks || []).map(function(pack) {
    return '<div class="sub-pack-card" onclick="handleBuyPack(\'' + pack.id + '\')"><div class="sub-pack-name">' + pack.name + '</div><div class="sub-pack-price">¥' + pack.price + '</div><div class="sub-pack-credits">' + pack.credits.toLocaleString() + ' 积分</div>' + (pack.bonus > 0 ? '<div class="sub-pack-bonus">+' + Math.round(pack.bonus * 100) + '%</div>' : '') + '</div>';
  }).join('');
  
  if (window.lucide) lucide.createIcons();
}

// 处理订阅
window.handleSubscribe = async function(planId) {
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;
  
  if (planId === 'free') {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '处理中...';
    try {
      const res = await fetch(API_BASE + '/api/subscription/trial', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      });
      const result = await res.json();
      if (result.success) {
        alert('✅ 试用已开启');
        loadSubscriptionData();
        if (typeof refreshSidebarCredits === 'function') refreshSidebarCredits();
      } else {
        alert('❌ ' + result.error);
        btn.disabled = false;
        btn.textContent = '开始试用';
      }
    } catch (e) {
      alert('网络错误');
      btn.disabled = false;
      btn.textContent = '开始试用';
    }
    return;
  }
  
  // 付费套餐
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '创建订单...';
  
  try {
    const res = await fetch(API_BASE + '/api/alipay/subscribe', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId })
    });
    const result = await res.json();
    
    if (result.success && result.data.payUrl) {
      // 电脑端：新窗口打开扫码，手机端：直接跳转
      if (isMobile()) {
        window.location.href = result.data.payUrl;
      } else {
        window.open(result.data.payUrl, '_blank', 'width=900,height=600');
        btn.textContent = '请在支付窗口完成付款';
        // 轮询订单状态
        pollOrderStatus(result.data.outTradeNo);
      }
    } else {
      alert('❌ ' + (result.error || '创建订单失败'));
      btn.disabled = false;
      btn.textContent = '订阅';
    }
  } catch (e) {
    alert('网络错误');
    btn.disabled = false;
    btn.textContent = '订阅';
  }
};

// 购买积分包
window.handleBuyPack = async function(packId) {
  const token = localStorage.getItem('lingxi_token');
  if (!token) return;
  
  try {
    const res = await fetch(API_BASE + '/api/alipay/credit-pack', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId })
    });
    const result = await res.json();
    
    if (result.success && result.data.payUrl) {
      if (isMobile()) {
        window.location.href = result.data.payUrl;
      } else {
        window.open(result.data.payUrl, '_blank', 'width=900,height=600');
      }
    } else {
      alert('❌ ' + (result.error || '创建订单失败'));
    }
  } catch (e) {
    alert('网络错误');
  }
};

// 检测是否手机端
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 轮询订单状态
async function pollOrderStatus(outTradeNo) {
  const token = localStorage.getItem('lingxi_token');
  let count = 0;
  const interval = setInterval(async function() {
    if (count++ > 60) { // 最多轮询 5 分钟
      clearInterval(interval);
      return;
    }
    try {
      const res = await fetch(API_BASE + '/api/alipay/order/' + outTradeNo, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const result = await res.json();
      if (result.success && result.data.status === 'paid') {
        clearInterval(interval);
        alert('✅ 支付成功！');
        loadSubscriptionData();
        if (typeof refreshSidebarCredits === 'function') refreshSidebarCredits();
      }
    } catch (e) {}
  }, 5000);
}

// 点击外部关闭
document.addEventListener('click', function(e) {
  if (e.target.id === 'subscriptionModal') window.closeSubscriptionModal();
});

console.log('✅ 订阅模块已加载（支付宝 - 电脑扫码 + 手机H5）');
