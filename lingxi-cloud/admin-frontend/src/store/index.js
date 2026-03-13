/**
 * 灵犀云管理后台 - 全局状态管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============ 认证状态 ============

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      admin: null,
      isAuthenticated: false,
      
      setAuth: (token, admin) => set({ 
        token, 
        admin, 
        isAuthenticated: true 
      }),
      
      logout: () => {
        localStorage.removeItem('admin_token');
        set({ token: null, admin: null, isAuthenticated: false });
      }
    }),
    {
      name: 'admin-auth',
      partialize: (state) => ({ token: state.token, admin: state.admin })
    }
  )
);

// ============ 用户管理状态 ============

export const useUserStore = create((set) => ({
  users: [],
  currentUser: null,
  loading: false,
  total: 0,
  
  setUsers: (users, total) => set({ users, total }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setLoading: (loading) => set({ loading }),
  
  reset: () => set({ users: [], currentUser: null, loading: false, total: 0 })
}));

// ============ 模型配置状态 ============

export const useModelStore = create((set) => ({
  config: null,
  providers: [],
  loading: false,
  
  setConfig: (config) => set({ config }),
  setProviders: (providers) => set({ providers }),
  setLoading: (loading) => set({ loading }),
  
  reset: () => set({ config: null, providers: [], loading: false })
}));

// ============ 仪表盘状态 ============

export const useDashboardStore = create((set) => ({
  stats: null,
  usageTrend: [],
  loading: false,
  
  setStats: (stats) => set({ stats }),
  setUsageTrend: (trend) => set({ usageTrend: trend }),
  setLoading: (loading) => set({ loading }),
  
  reset: () => set({ stats: null, usageTrend: [], loading: false })
}));
