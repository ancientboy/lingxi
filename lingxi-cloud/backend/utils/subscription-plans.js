/**
 * 订阅套餐配置
 */

export const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free',
    nameCN: '免费版',
    price: 0,
    credits: {
      monthly: 0,           // 每月免费积分
      daily: 100,           // 每日免费积分
      features: ['100 积分/日', '基础 AI 功能', '社区支持']
    }
  },
  lite: {
    name: 'Lite',
    nameCN: '轻量版',
    price: 29,
    credits: {
      monthly: 20000,       // 每月 20000 积分
      daily: 0,             // 无每日免费额度
      features: ['20000 积分/月', '全部 AI 功能', '优先支持', '图片生成']
    }
  },
  pro: {
    name: 'Pro',
    nameCN: '专业版',
    price: 99,
    credits: {
      monthly: 60000,       // 每月 60000 积分
      daily: 0,             // 无每日免费额度
      features: ['60000 积分/月', '全部 AI 功能', '专属客服', '无限图片生成']
    }
  }
};

/**
 * 获取用户的月度积分配额
 * @param {string} plan - 订阅套餐
 * @returns {number} - 月度积分配额
 */
export function getMonthlyQuota(plan) {
  return SUBSCRIPTION_PLANS[plan]?.credits.monthly || 0;
}

/**
 * 获取用户的每日免费积分
 * @param {string} plan - 订阅套餐
 * @returns {number} - 每日免费积分
 */
export function getDailyCredits(plan) {
  return SUBSCRIPTION_PLANS[plan]?.credits.daily || 0;
}

/**
 * 升级/续费套餐时，重置用户积分
 * @param {object} user - 用户对象
 * @param {string} newPlan - 新套餐
 */
export function resetUserCredits(user, newPlan) {
  const plan = SUBSCRIPTION_PLANS[newPlan];
  if (!plan) return;

  const now = new Date();
  const currentMonth = now.toISOString().substring(0, 7); // YYYY-MM

  // 初始化 credits 对象
  if (!user.credits) {
    user.credits = {
      balance: 0,
      freeDaily: 0,
      freeDailyUsed: 0,
      lastDailyReset: null,
      monthlyQuota: 0,
      lastMonthlyReset: null
    };
  }

  // 设置月度积分
  if (plan.credits.monthly > 0) {
    user.credits.balance = plan.credits.monthly;
    user.credits.monthlyQuota = plan.credits.monthly;
    user.credits.lastMonthlyReset = currentMonth;
    user.points = plan.credits.monthly;  // 同步 points 字段
  }

  // 设置每日免费积分
  user.credits.freeDaily = plan.credits.daily;
  user.credits.freeDailyUsed = 0;
  user.credits.lastDailyReset = now.toISOString().split('T')[0];

  console.log(`[积分重置] ${user.nickname} 升级到 ${plan.nameCN}: ${plan.credits.monthly || plan.credits.daily} 积分`);
}
