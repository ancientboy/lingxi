/**
 * 登录页面
 */

import React, { useState } from 'react';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import { authApi } from '../services/api';

const { Title, Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const data = await authApi.login({
        username: values.username,
        password: values.password
      });
      
      if (data.success) {
        localStorage.setItem('admin_token', data.token);
        setAuth(data.token, data.admin);
        message.success('登录成功');
        navigate('/admin');
      } else {
        message.error(data.error || '登录失败');
      }
    } catch (error) {
      message.error('登录失败: ' + (error.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 8 }}>⚡ 灵犀云</Title>
          <Text type="secondary">管理后台</Text>
        </div>
        
        <Form onFinish={handleLogin} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
        
        <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
          仅限管理员访问
        </Text>
      </Card>
    </div>
  );
}
