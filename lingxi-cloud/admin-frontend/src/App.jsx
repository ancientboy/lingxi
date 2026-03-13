/**
 * 灵犀云管理后台 - 主入口
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

import MainLayout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import ModelConfig from './pages/ModelConfig';
import ApiKeys from './pages/ApiKeys';
import InviteCodes from './pages/InviteCodes';
import Servers from './pages/Servers';

import { useAuthStore } from './store';

// 路由守卫
function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/admin/login" replace />;
}

// 已登录后访问登录页重定向
function PublicRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return !isAuthenticated ? children : <Navigate to="/admin" replace />;
}

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6
        }
      }}
    >
      <BrowserRouter>
        <Routes>
          {/* 登录页 */}
          <Route 
            path="/admin/login" 
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } 
          />
          
          {/* 管理后台 */}
          <Route 
            path="/admin" 
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="models" element={<ModelConfig />} />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route path="invite-codes" element={<InviteCodes />} />
            <Route path="servers" element={<Servers />} />
          </Route>
          
          {/* 默认重定向 */}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
