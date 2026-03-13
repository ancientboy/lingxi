/**
 * 服务器管理页面
 */

import React, { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Drawer, Descriptions, message, Typography, Badge
} from 'antd';
import {
  LinkOutlined, ReloadOutlined, UserOutlined,
  CloudServerOutlined, GlobalOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuthStore } from '../store';

const { Title, Text } = Typography;

export default function Servers() {
  const { admin } = useAuthStore();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState({ visible: false, server: null });

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/admin/servers', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      }).then(res => res.json());
      
      setServers(data.servers || []);
    } catch (error) {
      message.error('加载服务器列表失败: ' + (error.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleView = (server) => {
    setDrawer({ visible: true, server });
  };

  // 获取订阅标签
  const getPlanTag = (plan) => {
    const config = {
      free: { color: 'default', text: 'Free' },
      lite: { color: 'green', text: 'Lite' },
      pro: { color: 'blue', text: 'Pro' },
      enterprise: { color: 'purple', text: 'Enterprise' }
    };
    const p = config[plan] || config.free;
    return <Tag color={p.color}>{p.text}</Tag>;
  };

  // 获取状态徽标
  const getStatusBadge = (status) => {
    const config = {
      running: { status: 'success', text: '运行中' },
      pending: { status: 'processing', text: '启动中' },
      stopped: { status: 'default', text: '已停止' },
      error: { status: 'error', text: '异常' }
    };
    const s = config[status] || config.pending;
    return <Badge status={s.status} text={s.text} />;
  };

  const columns = [
    {
      title: '服务器',
      key: 'server',
      render: (_, record) => (
        <Space>
          <CloudServerOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          <div>
            <Text strong style={{ fontFamily: 'monospace' }}>{record.serverInfo?.ip}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              端口: {record.serverInfo?.port} | 会话: {record.serverInfo?.session}
            </Text>
          </div>
        </Space>
      )
    },
    {
      title: '用户',
      dataIndex: 'nickname',
      key: 'nickname',
      render: (text, record) => (
        <Space>
          <UserOutlined />
          <div>
            <Text strong>{text}</Text>
            {record.isAdmin && <Tag color="gold" style={{ marginLeft: 8 }}>管理员</Tag>}
          </div>
        </Space>
      )
    },
    {
      title: '订阅',
      key: 'subscription',
      render: (_, record) => getPlanTag(record.subscription?.plan || 'free')
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusBadge(status)
    },
    {
      title: '规格',
      dataIndex: 'spec',
      key: 'spec',
      render: (spec) => spec ? <Tag>{spec}</Tag> : <Text type="secondary">-</Text>
    },
    {
      title: '地区',
      dataIndex: 'region',
      key: 'region',
      render: (region) => region ? (
        <Space>
          <GlobalOutlined />
          <span>{region}</span>
        </Space>
      ) : '-'
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time) => time ? dayjs(time).format('MM-DD HH:mm') : '-',
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => handleView(record)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            href={record.serverInfo?.url}
            target="_blank"
          >
            访问
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        🖥️ 服务器管理
      </Title>

      {/* 操作栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadServers} loading={loading}>
            刷新
          </Button>
          <Text type="secondary">
            共 {servers.length} 台服务器
          </Text>
        </Space>
      </Card>

      {/* 服务器列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={servers}
          rowKey="serverId"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 台服务器`
          }}
        />
      </Card>

      {/* 详情抽屉 */}
      <Drawer
        title="服务器详情"
        width={600}
        open={drawer.visible}
        onClose={() => setDrawer({ visible: false, server: null })}
      >
        {drawer.server && (
          <div>
            {/* 服务器信息 */}
            <Descriptions title="🖥️ 服务器信息" column={1} bordered>
              <Descriptions.Item label="服务器地址">
                <Space>
                  <LinkOutlined />
                  <a href={drawer.server.serverInfo?.url} target="_blank" rel="noopener noreferrer">
                    {drawer.server.serverInfo?.url}
                  </a>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="IP 地址">
                <Text code>{drawer.server.serverInfo?.ip}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="端口">
                {drawer.server.serverInfo?.port}
              </Descriptions.Item>
              <Descriptions.Item label="会话">
                {drawer.server.serverInfo?.session}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {getStatusBadge(drawer.server.status)}
              </Descriptions.Item>
              <Descriptions.Item label="规格">
                {drawer.server.spec || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="地区">
                {drawer.server.region || '-'}
              </Descriptions.Item>
            </Descriptions>

            {/* 用户信息 */}
            <Descriptions title="👤 用户信息" column={1} bordered style={{ marginTop: 24 }}>
              <Descriptions.Item label="昵称">
                {drawer.server.nickname}
                {drawer.server.isAdmin && <Tag color="gold" style={{ marginLeft: 8 }}>管理员</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="用户ID">
                <code>{drawer.server.userId?.substring(0, 8)}...</code>
              </Descriptions.Item>
              <Descriptions.Item label="订阅套餐">
                {getPlanTag(drawer.server.subscription?.plan || 'free')}
              </Descriptions.Item>
              <Descriptions.Item label="积分余额">
                {(drawer.server.credits?.balance || 0).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            {/* 实例信息 */}
            <Descriptions title="📦 实例信息" column={1} bordered style={{ marginTop: 24 }}>
              <Descriptions.Item label="服务器ID">
                <code>{drawer.server.serverId}</code>
              </Descriptions.Item>
              <Descriptions.Item label="阿里云实例ID">
                <code>{drawer.server.aliyunInstanceId || '-'}</code>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {drawer.server.createdAt 
                  ? dayjs(drawer.server.createdAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-'
                }
              </Descriptions.Item>
              <Descriptions.Item label="健康检查">
                {drawer.server.healthCheckedAt 
                  ? dayjs(drawer.server.healthCheckedAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-'
                }
              </Descriptions.Item>
              <Descriptions.Item label="最后登录">
                {drawer.server.lastLoginAt 
                  ? dayjs(drawer.server.lastLoginAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-'
                }
              </Descriptions.Item>
            </Descriptions>

            <Text type="secondary" style={{ marginTop: 24, display: 'block' }}>
              💡 点击"服务器地址"可直接访问用户的 OpenClaw 管理界面
            </Text>
          </div>
        )}
      </Drawer>
    </div>
  );
}
