/**
 * API Key 管理页面
 */

import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Switch, Space, Tag, message,
  Typography, Badge, Modal, Form, Input, Popconfirm, Tabs
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, DeleteOutlined,
  KeyOutlined, CheckCircleOutlined, CloseCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function ApiKeys() {
  const [providers, setProviders] = useState({});
  const [loading, setLoading] = useState(false);
  const [addModal, setAddModal] = useState({ visible: false, provider: null });

  useEffect(() => {
    loadKeys();
    
    // 每 30 秒刷新
    const timer = setInterval(loadKeys, 30000);
    return () => clearInterval(timer);
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/admin/models/keys', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` }
      }).then(res => res.json());
      
      if (data.success) {
        setProviders(data.providers);
      }
    } catch (error) {
      message.error('加载失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async (values) => {
    try {
      const data = await fetch(`/api/admin/models/keys/${addModal.provider}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({ key: values.key })
      }).then(res => res.json());
      
      if (data.success) {
        message.success('添加成功');
        setAddModal({ visible: false, provider: null });
        loadKeys();
      } else {
        message.error(data.error || '添加失败');
      }
    } catch (error) {
      message.error('添加失败: ' + error.message);
    }
  };

  const handleDeleteKey = async (provider, index) => {
    try {
      const data = await fetch(`/api/admin/models/keys/${provider}/${index}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` }
      }).then(res => res.json());
      
      if (data.success) {
        message.success('删除成功');
        loadKeys();
      } else {
        message.error(data.error || '删除失败');
      }
    } catch (error) {
      message.error('删除失败: ' + error.message);
    }
  };

  const handleToggleKey = async (provider, index, enabled) => {
    try {
      const data = await fetch(`/api/admin/models/keys/${provider}/${index}/toggle`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({ enabled })
      }).then(res => res.json());
      
      if (data.success) {
        message.success(data.message);
        loadKeys();
      } else {
        message.error(data.error || '操作失败');
      }
    } catch (error) {
      message.error('操作失败: ' + error.message);
    }
  };

  const handleResetUsage = async (provider, index) => {
    try {
      const data = await fetch(`/api/admin/models/keys/${provider}/${index}/reset`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` }
      }).then(res => res.json());
      
      if (data.success) {
        message.success('使用量已重置');
        loadKeys();
      } else {
        message.error(data.error || '操作失败');
      }
    } catch (error) {
      message.error('操作失败: ' + error.message);
    }
  };

  const getColumns = (providerId) => [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      render: (v) => `#${v + 1}`
    },
    {
      title: 'API Key',
      dataIndex: 'keyPreview',
      key: 'keyPreview',
      render: (key) => <code style={{ fontFamily: 'monospace' }}>{key}</code>
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled, record) => (
        <Switch
          checked={enabled}
          onChange={(v) => handleToggleKey(providerId, record.index, v)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      )
    },
    {
      title: '使用量',
      dataIndex: 'usage',
      key: 'usage',
      width: 100,
      render: (usage) => <Badge count={usage || 0} showZero style={{ backgroundColor: '#52c41a' }} />
    },
    {
      title: '添加时间',
      dataIndex: 'addedAt',
      key: 'addedAt',
      width: 150,
      render: (time) => time ? dayjs(time).format('MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => handleResetUsage(providerId, record.index)}
          >
            重置
          </Button>
          <Popconfirm
            title="确定删除此 Key？"
            onConfirm={() => handleDeleteKey(providerId, record.index)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const renderProviderCard = (providerId, provider) => {
    const totalKeys = provider.keys?.length || 0;
    const enabledKeys = provider.keys?.filter(k => k.enabled).length || 0;
    const totalUsage = provider.keys?.reduce((s, k) => s + (k.usage || 0), 0) || 0;

    return (
      <Card
        key={providerId}
        title={
          <Space>
            <KeyOutlined />
            <span>{provider.name}</span>
            <Tag color={enabledKeys > 0 ? 'green' : 'red'}>
              {enabledKeys}/{totalKeys} 可用
            </Tag>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModal({ visible: true, provider: providerId })}
          >
            添加 Key
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Space style={{ marginBottom: 16 }}>
          <Text type="secondary">
            总 Key: {totalKeys} | 
            可用: {enabledKeys} | 
            总调用: {totalUsage}
          </Text>
        </Space>
        
        <Table
          columns={getColumns(providerId)}
          dataSource={provider.keys || []}
          rowKey="index"
          pagination={false}
          size="small"
          loading={loading}
          locale={{ emptyText: '暂无 API Key' }}
        />
      </Card>
    );
  };

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        🔑 API Key 轮询配置
      </Title>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadKeys} loading={loading}>
            刷新
          </Button>
          <Text type="secondary">
            💡 添加多个 Key 后，系统会自动轮询使用，实现负载均衡
          </Text>
        </Space>
      </Card>

      {Object.entries(providers).map(([id, provider]) => 
        renderProviderCard(id, provider)
      )}

      {/* 添加 Key 弹窗 */}
      <Modal
        title={`添加 API Key - ${providers[addModal.provider]?.name || ''}`}
        open={addModal.visible}
        onCancel={() => setAddModal({ visible: false, provider: null })}
        footer={null}
      >
        <Form
          layout="vertical"
          onFinish={handleAddKey}
        >
          <Form.Item
            name="key"
            label="API Key"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password 
              placeholder="sk-xxxxxxxxxxxxxxxx" 
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                添加
              </Button>
              <Button onClick={() => setAddModal({ visible: false, provider: null })}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
