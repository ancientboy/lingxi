/**
 * 灵犀云管理后台 - API 服务
 */

import axios from 'axios';

const API_BASE = '/api/admin';

// 创建 axios 实例
const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器 - 添加认证 Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器 - 统一错误处理
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error.response?.data || error);
  }
);

// ============ 用户管理 API ============

export const userApi = {
  // 获取用户列表
  getList: (params) => api.get('/users', { params }),
  
  // 获取用户详情
  getDetail: (userId) => api.get(`/users/${userId}`),
  
  // 订阅授权
  setSubscription: (userId, data) => api.post(`/users/${userId}/subscribe`, data),
  
  // 积分操作
  updateCredits: (userId, data) => api.post(`/users/${userId}/credits`, data),
  
  // 获取用户积分流水
  getCreditsHistory: (userId) => api.get(`/users/${userId}/credits/history`)
};

// ============ 模型配置 API ============

export const modelApi = {
  // 获取模型配置
  getConfig: () => api.get('/models/config'),
  
  // 更新模型配置
  updateConfig: (data) => api.put('/models/config', data),
  
  // 获取供应商状态
  getProviders: () => api.get('/models/providers'),
  
  // 测试供应商
  testProvider: (provider) => api.post(`/models/providers/${provider}/test`)
};

// ============ 仪表盘 API ============

export const dashboardApi = {
  // 获取统计数据
  getStats: () => api.get('/dashboard'),
  
  // 获取调用量趋势
  getUsageTrend: (days = 7) => api.get('/dashboard/usage-trend', { params: { days } })
};

// ============ 邀请码 API ============

export const inviteCodeApi = {
  // 获取邀请码列表
  getList: (params) => api.get('/invite-codes', { params }),
  
  // 批量生成邀请码
  generate: (data) => api.post('/invite-codes/generate', data),
  
  // 禁用邀请码
  disable: (code) => api.post(`/invite-codes/${code}/disable`)
};

// ============ 服务器 API ============

export const serverApi = {
  // 获取服务器列表
  getList: () => api.get('/servers'),
  
  // 获取服务器详情
  getDetail: (userId) => api.get(`/servers/${userId}`)
};

// ============ 认证 API ============

export const authApi = {
  // 管理员登录
  login: (credentials) => api.post('/auth/login', credentials),
  
  // 验证 Token
  verify: () => api.get('/auth/verify')
};

export default api;
