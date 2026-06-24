/**
 * Stripe 支付模块
 * 依赖: Stripe.js
 */

let stripe = null;
let elements = null;

// 初始化 Stripe
async function initStripe() {
  try {
    const res = await fetch(`${API_BASE}/api/stripe/config`);
    const result = await res.json();
    
    if (result.success) {
      stripe = Stripe(result.data.publishableKey);
      console.log('✅ Stripe 初始化成功');
    }
  } catch (e) {
    console.error('Stripe 初始化失败:', e);
  }
}

// 创建支付弹窗
function showPaymentModal(options) {
  const { amount, planName, clientSecret, onSuccess, onClose } = options;
  
  // 创建弹窗
  const modal = document.createElement('div');
  modal.id = 'stripePaymentModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal payment-modal">
      <div class="modal-header">
        <h3><i data-lucide="credit-card" class="icon-sm icon-primary"></i> 支付</h3>
        <button class="close-btn" onclick="closePaymentModal()">
          <i data-lucide="x" class="icon-sm"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="payment-info">
          <div class="payment-amount">¥${amount}</div>
          <div class="payment-desc">${planName}</div>
        </div>
        <div id="paymentElement"></div>
        <div id="paymentMessage" class="payment-message"></div>
        <button id="submitPayment" class="payment-submit-btn">
          <i data-lucide="lock" class="icon-xs"></i>
          确认支付
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 初始化 Lucide 图标
  if (window.lucide) lucide.createIcons();
  
  // 初始化支付元素
  initPaymentElement(clientSecret, onSuccess);
  
  // 点击外部关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePaymentModal();
      if (onClose) onClose();
    }
  });
}

// 初始化支付元素
async function initPaymentElement(clientSecret, onSuccess) {
  if (!stripe) {
    await initStripe();
  }
  
  if (!stripe) {
    document.getElementById('paymentMessage').textContent = '支付系统初始化失败，请刷新页面';
    return;
  }
  
  // 创建支付元素
  elements = stripe.elements({
    clientSecret: clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#10a37f',
        colorBackground: '#ffffff',
        colorText: '#202123',
        borderRadius: '8px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }
    }
  });
  
  const paymentElement = elements.create('payment', {
    layout: 'tabs'
  });
  
  paymentElement.mount('#paymentElement');
  
  // 绑定提交按钮
  document.getElementById('submitPayment').addEventListener('click', () => {
    handleSubmit(onSuccess);
  });
}

// 处理支付提交
async function handleSubmit(onSuccess) {
  const submitBtn = document.getElementById('submitPayment');
  const messageEl = document.getElementById('paymentMessage');
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading-spinner"></span> 处理中...';
  messageEl.textContent = '';
  
  if (!stripe || !elements) {
    messageEl.textContent = '支付系统未初始化';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="lock" class="icon-xs"></i> 确认支付';
    return;
  }
  
  try {
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements: elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required'
    });
    
    if (error) {
      messageEl.textContent = error.message;
      messageEl.className = 'payment-message error';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="lock" class="icon-xs"></i> 确认支付';
      if (window.lucide) lucide.createIcons();
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      messageEl.textContent = '支付成功！';
      messageEl.className = 'payment-message success';
      submitBtn.innerHTML = '<i data-lucide="check" class="icon-xs"></i> 支付成功';
      submitBtn.className = 'payment-submit-btn success';
      
      // 关闭弹窗并回调
      setTimeout(() => {
        closePaymentModal();
        if (onSuccess) onSuccess(paymentIntent);
      }, 1500);
    }
  } catch (e) {
    messageEl.textContent = '支付失败: ' + e.message;
    messageEl.className = 'payment-message error';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="lock" class="icon-xs"></i> 确认支付';
    if (window.lucide) lucide.createIcons();
  }
}

// 关闭支付弹窗
function closePaymentModal() {
  const modal = document.getElementById('stripePaymentModal');
  if (modal) {
    modal.remove();
  }
}

// 发起订阅支付
async function initiateSubscriptionPayment(planId, planName, amount) {
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    alert('请先登录');
    return;
  }
  
  try {
    // 创建支付意图
    const res = await fetch(`${API_BASE}/api/stripe/create-subscription-payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ planId })
    });
    
    const result = await res.json();
    
    if (result.success) {
      showPaymentModal({
        amount: amount,
        planName: planName,
        clientSecret: result.data.clientSecret,
        onSuccess: () => {
          // 刷新订阅数据
          if (typeof loadSubscriptionData === 'function') {
            loadSubscriptionData();
          }
          if (typeof refreshSidebarCredits === 'function') {
            refreshSidebarCredits();
          }
        }
      });
    } else {
      alert('创建支付失败: ' + result.error);
    }
  } catch (e) {
    alert('网络错误: ' + e.message);
  }
}

// 发起积分包支付
async function initiateCreditPayment(packId, packName, amount) {
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    alert('请先登录');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/stripe/create-credit-payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ packId })
    });
    
    const result = await res.json();
    
    if (result.success) {
      showPaymentModal({
        amount: amount,
        planName: packName,
        clientSecret: result.data.clientSecret,
        onSuccess: () => {
          if (typeof loadSubscriptionData === 'function') {
            loadSubscriptionData();
          }
          if (typeof refreshSidebarCredits === 'function') {
            refreshSidebarCredits();
          }
        }
      });
    } else {
      alert('创建支付失败: ' + result.error);
    }
  } catch (e) {
    alert('网络错误: ' + e.message);
  }
}

// 页面加载时初始化 Stripe
document.addEventListener('DOMContentLoaded', () => {
  initStripe();
});

// 导出到全局
window.initStripe = initStripe;
window.showPaymentModal = showPaymentModal;
window.closePaymentModal = closePaymentModal;
window.initiateSubscriptionPayment = initiateSubscriptionPayment;
window.initiateCreditPayment = initiateCreditPayment;

console.log('✅ Stripe 支付模块已加载');
