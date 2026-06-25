/**
 * 订阅档位判断 — 云端 OpenClaw 部署仅面向付费用户
 */

export function isPaidSubscription(user) {
  if (!user) return false;
  const sub = user.subscription || {};
  const plan = sub.plan || 'free';
  if (plan === 'free') return false;
  if (sub.status === 'active') return true;
  if (!sub.endDate) return true;
  return new Date(sub.endDate) > new Date();
}

export function paidSubscriptionError() {
  return {
    status: 403,
    body: {
      error: '云端 OpenClaw 为付费订阅服务，请先升级套餐',
      needSubscription: true,
    },
  };
}
