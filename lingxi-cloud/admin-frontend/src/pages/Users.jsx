/**
 * 用户管理页面
 */

import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Input, Select, Tag, Space, Modal,
  Drawer, Descriptions, Statistic, message, Popconfirm, Form,
  InputNumber, DatePicker, Badge, Tabs
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, GiftOutlined,
  CrownOutlined, UserOutlined, MoreOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useUserStore } from '../store';
import { userApi } from '../services/api';

const { Search } = Input;
const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

export default function Users() {
  const { users, total, loading, setUsers, setLoading } = useUserStore();
  
  const [searchText, setSearchText] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // 详情抽屉
  const [detailDrawer, setDetailDrawer] = useState({ visible: false, user: null });
  
  // 订阅弹窗
  const [subModal, setSubModal] = useState({ visible: false, user: null });
  
  // 积分弹窗
  const [creditModal, setCreditModal] = useState({ visible: false, user: null });

  // 积分流水
  const [creditsHistory, setCreditsHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [currentPage, pageSize, planFilter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        pageSize,
        plan: planFilter !== 'all' ? planFilter : undefined,
        search: searchText || undefined
      };
      
      const data = await userApi.getList(params);
      setUsers(data.users || [], data.total || 0);
    } catch (error) {
      message.error('加载用户列表失败: ' + (error.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadUsers();
  };

  // 获取积分流水
  const loadCreditsHistory = async (userId) => {
    setHistoryLoading(true);
    try {
      const data = await userApi.getCreditsHistory(userId);
      setCreditsHistory(data.history || []);
    } catch (error) {
      message.error('加载积分流水失败: ' + (error.error || error.message));
    } finally {
      setHistoryLoading(false);
    }
  };

  // 订阅授权
  const handleSubscription = async (values) => {
    try {
      await userApi.setSubscription(subModal.user.id, {
        plan: values.plan,
        months: values.months || 1,
        reason: values.reason
      });
      message.success('订阅授权成功');
      setSubModal({ visible: false, user: null });
      loadUsers();
    } catch (error) {
      message.error('授权失败: ' + (error.error || error.message));
    }
  };

  // 积分操作
  const handleCredits = async (values) => {
    try {
      await userApi.updateCredits(creditModal.user.id, {
        points: values.points,
        reason: values.reason,
        type: values.type || 'gift'
      });
      message.success('积分操作成功');
      setCreditModal({ visible: false, user: null });
      loadUsers();
    } catch (error) {
      message.error('操作失败: ' + (error.error || error.message));
    }
  };

  // 获取订阅标签
  const getPlanTag = (plan) => {
    const config = {
      free: { color: 'default', text: 'Free' },
      lite: { color: 'green', text: 'Lite' },
      pro: { color: 'blue', text: 'Pro' }
    };
    const c = config[plan] || config.free;
    return <Tag color={c.color}>{c.text}</Tag>;
  };

  const columns = [
    {
      title: '用户',
      dataIndex: 'nickname',
      key: 'nickname',
      render: (text, record) => (
        <Space>
          <UserOutlined />
          <span>{text}</span>
          {record.isAdmin && <Tag color="gold">管理员</Tag>}
        </Space>
      )
    },
    {
      title: '订阅',
      dataIndex: 'subscription',
      key: 'subscription',
      render: (sub) => getPlanTag(sub?.plan || 'free')
    },
    {
      title: '积分余额',
      dataIndex: 'credits',
      key: 'credits',
      render: (credits) => (
        <span style={{ fontWeight: 'bold' }}>
          {(credits?.balance || 0).toLocaleString()}
        </span>
      )
    },
    {
      title: '今日使用',
      dataIndex: 'usage',
      key: 'usage',
      render: (usage) => (
        <span>
          {((usage?.byDate || {})[dayjs().format('YYYY-MM-DD')]?.tokens || 0).toLocaleString()} tokens
        </span>
      )
    },
    {
      title: '最后登录',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      render: (date) => date ? dayjs(date).format('MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            type="link" 
            size="small"
            onClick={() => {
              setDetailDrawer({ visible: true, user: record });
              loadCreditsHistory(record.id);
            }}
          >
            详情
          </Button>
          <Button 
            type="link" 
            size="small"
            icon={<CrownOutlined />}
            onClick={() => setSubModal({ visible: true, user: record })}
          >
            订阅
          </Button>
          <Button 
            type="link" 
            size="small"
            icon={<GiftOutlined />}
            onClick={() => setCreditModal({ visible: true, user: record })}
          >
            积分
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      {/* 搜索和筛选 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Search
            placeholder="搜索用户昵称/ID"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 250 }}
            enterButton
          />
          <Select
            value={planFilter}
            onChange={(v) => { setPlanFilter(v); setCurrentPage(1); }}
            style={{ width: 120 }}
          >
            <Option value="all">全部订阅</Option>
            <Option value="free">Free</Option>
            <Option value="lite">Lite</Option>
            <Option value="pro">Pro</Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={loadUsers}>
            刷新
          </Button>
        </Space>
      </Card>

      {/* 用户列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 个用户`,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            }
          }}
        />
      </Card>

      {/* 用户详情抽屉 */}
      <Drawer
        title="用户详情"
        width={600}
        open={detailDrawer.visible}
        onClose={() => setDetailDrawer({ visible: false, user: null })}
      >
        {detailDrawer.user && (
          <Tabs defaultActiveKey="basic">
            {/* 基本信息 Tab */}
            <TabPane tab="基本信息" key="basic">
              <Descriptions column={2} bordered>
                <Descriptions.Item label="昵称">{detailDrawer.user.nickname}</Descriptions.Item>
                <Descriptions.Item label="ID">
                  <code>{detailDrawer.user.id.substring(0, 8)}...</code>
                </Descriptions.Item>
                <Descriptions.Item label="订阅">
                  {getPlanTag(detailDrawer.user.subscription?.plan || 'free')}
                </Descriptions.Item>
                <Descriptions.Item label="积分余额">
                  {(detailDrawer.user.credits?.balance || 0).toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="月度额度">
                  {(detailDrawer.user.credits?.monthlyQuota || 0).toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="今日免费">
                  {detailDrawer.user.credits?.freeDaily || 100} - 已用 {detailDrawer.user.credits?.freeDailyUsed || 0}
                </Descriptions.Item>
                <Descriptions.Item label="注册时间">
                  {dayjs(detailDrawer.user.createdAt).format('YYYY-MM-DD HH:mm')}
                </Descriptions.Item>
                <Descriptions.Item label="最后登录">
                  {detailDrawer.user.lastLoginAt ? dayjs(detailDrawer.user.lastLoginAt).format('YYYY-MM-DD HH:mm') : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="订阅开始" span={2}>
                  {detailDrawer.user.subscription?.startDate || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="订阅到期" span={2}>
                  {detailDrawer.user.subscription?.endDate || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="邀请人" span={2}>
                  {detailDrawer.user.invitedBy ? detailDrawer.user.invitedBy.substring(0, 8) + '...' : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="邀请数">
                  {detailDrawer.user.inviteCount || 0}
                </Descriptions.Item>
                <Descriptions.Item label="实例ID" span={2}>
                  <code>{detailDrawer.user.instanceId || '-'}</code>
                </Descriptions.Item>
                <Descriptions.Item label="实例状态">
                  <Tag color={detailDrawer.user.instanceStatus === 'ready' ? 'green' : 'orange'}>
                    {detailDrawer.user.instanceStatus}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            </TabPane>

            {/* 积分流水 Tab */}
            <TabPane tab="积分流水" key="history">
              <Table
                columns={[
                  {
                    title: '时间',
                    dataIndex: 'time',
                    key: 'time',
                    render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')
                  },
                  {
                    title: '类型',
                    dataIndex: 'type',
                    key: 'type',
                    render: (type) => (
                      <Tag color={type === 'earn' ? 'green' : 'red'}>
                        {type === 'earn' ? '收入' : '支出'}
                      </Tag>
                    )
                  },
                  {
                    title: '积分数',
                    dataIndex: 'points',
                    key: 'points',
                    render: (points) => (
                      <span style={{ fontWeight: 'bold', color: points > 0 ? '#52c41a' : '#f5222d' }}>
                        {points > 0 ? '+' : ''}{points}
                      </span>
                    )
                  },
                  {
                    title: '余额',
                    dataIndex: 'balance',
                    key: 'balance'
                  },
                  {
                    title: '原因',
                    dataIndex: 'reason',
                    key: 'reason',
                    ellipsis: true
                  }
                ]}
                dataSource={creditsHistory}
                rowKey="time"
                loading={historyLoading}
                pagination={false}
                size="small"
              />
            </TabPane>
          </Tabs>
        )}
      </Drawer>

      {/* 订阅授权弹窗 */}
      <Modal
        title="订阅授权"
        open={subModal.visible}
        onCancel={() => setSubModal({ visible: false, user: null })}
        footer={null}
      >
        <Form onFinish={handleSubscription} layout="vertical">
          <Form.Item label="用户">
            <Input value={subModal.user?.nickname} disabled />
          </Form.Item>
          <Form.Item name="plan" label="订阅套餐" rules={[{ required: true }]}>
            <Select placeholder="选择套餐">
              <Option value="free">Free（免费）</Option>
              <Option value="lite">Lite（¥199/月）</Option>
              <Option value="pro">Pro（¥499/月）</Option>
            </Select>
          </Form.Item>
          <Form.Item name="months" label="授权月数" initialValue={1}>
            <InputNumber min={1} max={12} />
          </Form.Item>
          <Form.Item name="reason" label="授权原因">
            <TextArea rows={2} placeholder="可选" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              确认授权
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 积分操作弹窗 */}
      <Modal
        title="积分操作"
        open={creditModal.visible}
        onCancel={() => setCreditModal({ visible: false, user: null })}
        footer={null}
      >
        <Form onFinish={handleCredits} layout="vertical">
          <Form.Item label="当前积分">
            <Statistic value={creditModal.user?.credits?.balance || 0} />
          </Form.Item>
          <Form.Item name="type" label="操作类型" initialValue="gift">
            <Select>
              <Option value="gift">赠送</Option>
              <Option value="deduct">扣除</Option>
            </Select>
          </Form.Item>
          <Form.Item name="points" label="积分数" rules={[{ required: true }]}>
            <InputNumber min={1} max={100000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <TextArea rows={2} placeholder="必填" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              确认操作
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
