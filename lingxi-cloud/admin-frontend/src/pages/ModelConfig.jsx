/**
 * 模型配置页面
 */

import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Switch, InputNumber, Space, Tag, message,
  Divider, Typography, Row, Col, Statistic, Badge, Tooltip, Modal, Form, Input
} from 'antd';
import {
  ReloadOutlined, SaveOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ApiOutlined, RocketOutlined, EditOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useModelStore } from '../store';
import { modelApi } from '../services/api';

const { Title, Text } = Typography;

export default function ModelConfig() {
  const { config, providers, loading, setConfig, setProviders, setLoading } = useModelStore();
  const [localConfig, setLocalConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testProvider, setTestProvider] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [creditRates, setCreditRates] = useState(null);
  const [creditModal, setCreditModal] = useState({ visible: false, provider: null });

  useEffect(() => {
    loadConfig();
    loadProviders();
    loadCreditRates();
    
    // 每 30 秒刷新供应商状态
    const timer = setInterval(loadProviders, 30000);
    return () => clearInterval(timer);
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await modelApi.getConfig();
      setConfig(data.config || data);
      setLocalConfig(data.config || data);
    } catch (error) {
      message.error('加载配置失败: ' + (error.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const loadProviders = async () => {
    try {
      const data = await modelApi.getProviders();
      setProviders(data.providers || []);
    } catch (error) {
      console.error('加载供应商状态失败:', error);
    }
  };

  const loadCreditRates = async () => {
    try {
      const data = await fetch('/api/admin/models/credit-rates', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` }
      }).then(res => res.json());
      setCreditRates(data.creditRates);
    } catch (error) {
      console.error('加载积分率失败:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await modelApi.updateConfig(localConfig);
      message.success('配置已保存');
      loadConfig();
    } catch (error) {
      message.error('保存失败: ' + (error.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const updateModelPriority = (type, index, newPriority) => {
    const newConfig = { ...localConfig };
    const models = [...newConfig.freeModels[type]];
    models[index] = { ...models[index], priority: newPriority };
    models.sort((a, b) => a.priority - b.priority);
    newConfig.freeModels[type] = models.map((m, i) => ({ ...m, priority: i + 1 }));
    setLocalConfig(newConfig);
  };

  const toggleModel = (type, index, enabled) => {
    const newConfig = { ...localConfig };
    newConfig.freeModels[type][index].enabled = enabled;
    setLocalConfig(newConfig);
  };

  const testProviderConnection = async (provider) => {
    setTestProvider(provider);
    setTestLoading(true);
    setTestResult(null);
    
    try {
      const data = await modelApi.testProvider(provider);
      setTestResult(data);
      
      if (data.success) {
        message.success(data.message || `${provider} 连接测试成功`);
      } else {
        message.warning(data.error || `${provider} 连接测试失败`);
      }
    } catch (error) {
      setTestResult({
        success: false,
        error: error.error || error.message || '连接测试失败'
      });
      message.error(`测试失败: ${error.error || error.message}`);
    } finally {
      setTestLoading(false);
    }
  };

  const updateCreditRate = async (providerId, modelId, newRate) => {
    try {
      const updatedRates = { ...creditRates };
      if (!updatedRates[providerId]) {
        updatedRates[providerId] = { name: providerId, models: {} };
      }
      updatedRates[providerId].models[modelId] = parseFloat(newRate);
      
      const res = await fetch('/api/admin/models/credit-rates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({ creditRates: updatedRates })
      }).then(r => r.json());
      
      if (res.success) {
        message.success('积分率已更新');
        setCreditRates(updatedRates);
      } else {
        message.error(res.error || '更新失败');
      }
    } catch (error) {
      message.error('更新失败: ' + error.message);
    }
  };

  const modelColumns = (type) => [
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (val, _, index) => (
        <InputNumber
          min={1}
          max={10}
          value={val}
          onChange={(v) => updateModelPriority(type, index, v)}
        />
      )
    },
    {
      title: '模型 ID',
      dataIndex: 'id',
      key: 'id',
      render: (id) => <code>{id}</code>
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled, _, index) => (
        <Switch
          checked={enabled}
          onChange={(v) => toggleModel(type, index, v)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      )
    }
  ];

  const providerColumns = [
    {
      title: '供应商',
      dataIndex: 'name',
      key: 'name',
      render: (name) => <Tag color="blue">{name}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'healthy',
      key: 'healthy',
      render: (healthy) => (
        <Badge 
          status={healthy ? 'success' : 'error'} 
          text={healthy ? '正常' : '异常'}
        />
      )
    },
    {
      title: '可用 Key',
      dataIndex: 'availableKeys',
      key: 'availableKeys',
      render: (val, record) => `${val || 0} / ${record.totalKeys || 0}`
    },
    {
      title: '今日调用',
      dataIndex: 'todayRequests',
      key: 'todayRequests',
      render: (val) => (val || 0).toLocaleString()
    },
    {
      title: '最后检查',
      dataIndex: 'lastCheck',
      key: 'lastCheck',
      render: (time) => time ? dayjs(time).format('MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<RocketOutlined />}
          onClick={() => testProviderConnection(record.id)}
          loading={testLoading && testProvider === record.id}
        >
          测试
        </Button>
      )
    }
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        🤖 模型配置
      </Title>

      {/* 供应商状态 */}
      <Card 
        title="供应商状态" 
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadProviders}>
            刷新
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        <Table
          columns={providerColumns}
          dataSource={providers}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>

      {/* 文本模型配置 */}
      <Card 
        title="📝 免费文本模型"
        extra={
          <Space>
            <Button onClick={loadConfig}>重置</Button>
            <Button 
              type="primary" 
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              保存配置
            </Button>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
          按优先级顺序尝试模型，数字越小优先级越高
        </Text>
        <Table
          columns={modelColumns('text')}
          dataSource={localConfig?.freeModels?.text || []}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      {/* 视觉模型配置 */}
      <Card title="🖼️ 免费视觉模型" style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
          用于图片识别的模型池
        </Text>
        <Table
          columns={modelColumns('vision')}
          dataSource={localConfig?.freeModels?.vision || []}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      {/* 积分消耗率（可编辑） */}
      <Card 
        title="💰 积分消耗率" 
        style={{ marginTop: 24 }}
        extra={
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadCreditRates}
            size="small"
          >
            刷新
          </Button>
        }
      >
        <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
          配置不同供应商和模型的积分消耗率（积分/1K tokens）
        </Text>
        
        {creditRates && (
          <div>
            {Object.entries(creditRates).map(([providerId, provider]) => (
              <Card 
                key={providerId}
                size="small" 
                title={provider.name || providerId}
                style={{ marginBottom: 16 }}
              >
                <Row gutter={[16, 16]}>
                  {Object.entries(provider.models || {}).map(([modelId, rate]) => (
                    <Col span={8} key={modelId}>
                      <div style={{ marginBottom: 8 }}>
                        <Text strong>{modelId}</Text>
                      </div>
                      <Space>
                        <InputNumber
                          value={rate}
                          min={0}
                          max={100}
                          step={0.1}
                          precision={1}
                          onChange={(v) => updateCreditRate(providerId, modelId, v)}
                          style={{ width: 100 }}
                        />
                        <Text type="secondary">积分/1K</Text>
                      </Space>
                    </Col>
                  ))}
                </Row>
              </Card>
            ))}
          </div>
        )}
        
        <Divider />
        <Text type="secondary">
          💡 修改后立即生效。0 表示免费模型，不消耗积分
        </Text>
      </Card>

      {/* 测试结果弹窗 */}
      <Modal
        title="连接测试结果"
        open={!!testProvider}
        onCancel={() => {
          setTestProvider(null);
          setTestResult(null);
        }}
        footer={[
          <Button 
            key="close"
            onClick={() => {
              setTestProvider(null);
              setTestResult(null);
            }}
          >
            关闭
          </Button>
        ]}
      >
        {testResult && (
          <div>
            <Tag color={testResult.success ? 'success' : 'error'}>
              {testResult.success ? '✓ 测试成功' : '✗ 测试失败'}
            </Tag>
            {testResult.message && (
              <p style={{ marginTop: 16 }}>
                {testResult.message}
              </p>
            )}
            {testResult.error && !testResult.message && (
              <p style={{ marginTop: 16, color: '#f5222d' }}>
                错误: {testResult.error}
              </p>
            )}
            <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {testProvider} - {new Date().toLocaleTimeString()}
              </Text>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
