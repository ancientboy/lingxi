/**
 * 主布局组件
 */

import React from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Space } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  ApiOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  CodeOutlined,
  CloudServerOutlined,
  KeyOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, logout } = useAuthStore();

  const menuItems = [
    { key: '/admin', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/admin/users', icon: <TeamOutlined />, label: '用户管理' },
    { key: '/admin/servers', icon: <CloudServerOutlined />, label: '服务器管理' },
    { key: '/admin/models', icon: <ApiOutlined />, label: '模型配置' },
    { key: '/admin/api-keys', icon: <KeyOutlined />, label: 'API Key 轮询' },
    { key: '/admin/invite-codes', icon: <CodeOutlined />, label: '邀请码管理' }
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: handleLogout
      }
    ]
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        theme="light"
        width={220}
        style={{ 
          boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
          zIndex: 10
        }}
      >
        {/* Logo */}
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
            ⚡ 灵犀云
          </Title>
        </div>

        {/* 导航菜单 */}
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>

      <Layout>
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          zIndex: 9
        }}>
          <Text strong style={{ fontSize: 16 }}>
            {menuItems.find(i => i.key === location.pathname)?.label || '管理后台'}
          </Text>

          <Dropdown menu={userMenu} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
              <Text>{admin?.nickname || '管理员'}</Text>
            </Space>
          </Dropdown>
        </Header>

        <Content style={{
          margin: 24,
          padding: 24,
          background: '#fff',
          borderRadius: 8,
          minHeight: 'calc(100vh - 112px)'
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
