/**
 * 邀请码管理页面
 */

import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Tag, Space, message, Modal, Form,
  InputNumber, Input, Typography, Tabs, Statistic
} from 'antd';
import {
  PlusOutlined, CopyOutlined, StopOutlined,
  ReloadOutlined, UserOutlined, ClockCircleOutlined,
  DollarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { inviteCodeApi } from '../services/api';

import { useDashboardStore } from '../store';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

export default function InviteCodes() {
  const { stats, loading: statsLoading } = useDashboardStore();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [generateModal, setGenerateModal] = useState({ visible: false, count: 10 });
  const [generateLoading, setGenerateLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    loadCodes();
  }, [currentPage, pageSize, statusFilter]);

  const loadCodes = async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        pageSize,
        status: statusFilter !== 'all' ? statusFilter : undefined
      };
      
      const data = await inviteCodeApi.getList(params);
      setCodes(data.codes || []);
      setTotal(data.total || 0);
    } catch (error) {
      message.error('加载邀请码列表失败: ' + (error.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 生成邀请码
  const handleGenerate = async () => {
    setGenerateLoading(true);
    try {
      const data = await inviteCodeApi.generate({
        count: generateModal.count
      });
      
      message.success(data.message || `成功生成 ${data.codes.length} 个邀请码`);
      setGenerateModal({ visible: false, count: 10 });
      loadCodes();
    } catch (error) {
      message.error('生成失败: ' + (error.error || error.message));
    } finally {
      setGenerateLoading(false);
    }
  };

  // 复制邀请码
  const handleCopy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    message.success('已复制到剪贴板');
  };

  // 禁用邀请码
  const handleDisable = async (code) => {
    try {
      const data = await inviteCodeApi.disable(code);
      message.success(data.message || '邀请码已禁用');
      loadCodes();
    } catch (error) {
      message.error('禁用失败: ' + (error.error || error.message));
    }
  };

  const columns = [
    {
      title: '邀请码',
      dataIndex: 'code',
      key: 'code',
      render: (code) => (
        <Space>
          <code>{code}</code>
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(code)}
            disabled={copiedCode === code}
          >
            {copiedCode === code ? '已复制' : '复制'}
          </Button>
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'code',
      key: 'status',
      render: (_, record) => {
        if (record.disabled) {
          return <Tag color="red">已禁用</Tag>;
        } else if (record.used) {
          return <Tag color="green">已使用</Tag>;
        } else {
          return <Tag color="blue">未使用</Tag>;
        }
      }
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    },
    {
      title: '使用时间',
      dataIndex: 'usedAt',
      key: 'usedAt',
      render: (time) => time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => {
        if (record.used || record.disabled) {
          return <Text type="secondary">{record.used ? '已使用' : '已禁用'}</Text>;
        }
        return (
          <Button
            type="link"
            size="small"
            danger
            icon={<StopOutlined />}
            onClick={() => handleDisable(record.code)}
          >
            禁用
          </Button>
        );
      }
    }
  ];

  return (
    <div>
      {/* 标题和操作按钮 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setGenerateModal({ visible: true, count: 10 })}
          >
            批量生成
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadCodes}>
            刷新
          </Button>
        </Space>
      </Card>

      {/* 代码列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={codes}
          rowKey="code"
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 个邀请码`,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            }
          }}
        />
      </Card>

      {/* 生成邀请码弹窗 */}
      <Modal
        title="批量生成邀请码"
        open={generateModal.visible}
        onCancel={() => setGenerateModal({ visible: false, count: 10 })}
        footer={null}
      >
        <Form
          layout="vertical"
          onFinish={handleGenerate}
        >
          <Form.Item
            label="生成数量"
            name="count"
            initialValue={generateModal.count}
            rules={[{ required: true, message: '请输入生成数量' }]}
          >
            <InputNumber
              min={1}
              max={100}
              maxMessage="最多生成 100 个邀请码"
              style={{ width: '100%' }}
            />
          </Form.Item>
          
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            生成的邀请码可用于新用户注册，每个邀请码只能使用一次
          </Text>
          
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={generateLoading}
            >
              批量生成
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

