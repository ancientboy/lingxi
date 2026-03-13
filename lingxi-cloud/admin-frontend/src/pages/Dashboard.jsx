/**
 * 仪表盘页面
 */

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Progress, Typography, Spin, message, Space } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  DollarOutlined,
  ApiOutlined,
  RiseOutlined
} from '@ant-design/icons';
import { useDashboardStore } from '../store';
import { dashboardApi } from '../services/api';

const { Title, Text } = Typography;

export default function Dashboard() {
  const { stats, loading, setStats, setLoading } = useDashboardStore();
  const [usageTrend, setUsageTrend] = useState([]);
  const [trendLoading, setTrendLoading] = useState(true);

  useEffect(() => {
    loadStats();
    
    // 每 30 秒刷新一次
    const timer = setInterval(loadStats, 30000);
    return () => clearInterval(timer);
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await dashboardApi.getStats();
      setStats(data.data || data);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsageTrend = async () => {
    setTrendLoading(true);
    try {
      const data = await dashboardApi.getUsageTrend(7);
      setUsageTrend(data.trend || []);
    } catch (error) {
      console.error('加载使用量趋势失败:', error);
    } finally {
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    loadUsageTrend();
  }, []);

  if (loading && !stats) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  const userStats = stats?.users || {};
  const subStats = stats?.subscriptions || {};
  const usageStats = stats?.usage || {};

  // 财务统计计算
  const liteUsers = subStats.lite || 0;
  const proUsers = subStats.pro || 0;
  const monthlyRevenue = (liteUsers * 199 + proUsers * 499).toLocaleString();
  const totalValue = (liteUsers * 199 * 12 + proUsers * 499 * 12).toLocaleString();
  const paidConversionRate = ((liteUsers + proUsers) / (userStats.total || 1) * 100).toFixed(1);

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        📊 仪表盘
      </Title>

      {/* 用户统计 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={userStats.total || 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="活跃用户"
              value={userStats.active || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日新增"
              value={userStats.newToday || 0}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日调用量"
              value={usageStats.todayRequests || 0}
              prefix={<ApiOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 订阅分布 */}
      <Card 
        title="📦 订阅分布" 
        style={{ marginTop: 24 }}
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Free 用户</Text>
              <div style={{ fontSize: 32, fontWeight: 'bold', color: '#8c8c8c' }}>
                {subStats.free || 0}
              </div>
              <Progress 
                percent={Math.round(((subStats.free || 0) / (userStats.total || 1)) * 100)} 
                showInfo={false}
                strokeColor="#8c8c8c"
              />
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Lite 用户</Text>
              <div style={{ fontSize: 32, fontWeight: 'bold', color: '#52c41a' }}>
                {subStats.lite || 0}
              </div>
              <Progress 
                percent={Math.round(((subStats.lite || 0) / (userStats.total || 1)) * 100)} 
                showInfo={false}
                strokeColor="#52c41a"
              />
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Pro 用户</Text>
              <div style={{ fontSize: 32, fontWeight: 'bold', color: '#1890ff' }}>
                {subStats.pro || 0}
              </div>
              <Progress 
                percent={Math.round(((subStats.pro || 0) / (userStats.total || 1)) * 100)} 
                showInfo={false}
                strokeColor="#1890ff"
              />
            </div>
          </Col>
        </Row>
      </Card>

      {/* 使用量统计 */}
      <Card 
        title="📈 今日使用量" 
        style={{ marginTop: 24 }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Statistic
              title="Token 消耗"
              value={usageStats.todayTokens || 0}
              suffix="tokens"
            />
          </Col>
          <Col xs={24} sm={12}>
            <Statistic
              title="API 请求次数"
              value={usageStats.todayRequests || 0}
              suffix="次"
            />
          </Col>
        </Row>
      </Card>

      {/* 使用量趋势图 - 新增 */}
      <Card 
        title="📈 7天 Token 消耗趋势" 
        style={{ marginTop: 24 }}
      >
        {usageTrend.length > 0 ? (
          <div style={{ height: 250 }}>
            {/* 简单的 CSS 柱状图 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '100%', gap: 8 }}>
              {usageTrend.map((item, index) => {
                const maxTokens = Math.max(...usageTrend.map(d => d.tokens), 1);
                const heightPercent = (item.tokens / maxTokens) * 100;
                return (
                  <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div 
                      style={{ 
                        width: '100%', 
                        backgroundColor: '#1890ff', 
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease',
                        minHeight: '20px'
                      }}
                      title={`${item.date}: ${item.tokens} tokens`}
                    >
                      <div style={{ 
                        height: `${heightPercent}%`, 
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '10px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        padding: '4px 0'
                      }}>
                        {item.tokens > 0 ? (item.tokens >= 1000 ? `${(item.tokens / 1000).toFixed(1)}K` : item.tokens) : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', marginTop: 8, color: '#666' }}>
                      {item.date?.substring(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '50px 0' }}>
            {trendLoading ? '加载中...' : '暂无使用量数据'}
          </Text>
        )}
      </Card>

      {/* 财务统计卡片 - 新增 */}
      <Card 
        title="💰 财务统计" 
        style={{ marginTop: 24 }}
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <div style={{ textAlign: 'center', padding: 16, background: '#f0f9ff', borderRadius: 8 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>月收入估算</Text>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#52c41a' }}>
                ¥{monthlyRevenue}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                (Lite ¥199/月, Pro ¥499/月)
              </Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ textAlign: 'center', padding: 16, background: '#f6ffed', borderRadius: 8 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>年度总估算</Text>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#722ed1' }}>
                ¥{totalValue}
              </div>
            </div>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ textAlign: 'center', padding: 16, background: '#f9f0ff', borderRadius: 8 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>付费转化率</Text>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1890ff' }}>
                {paidConversionRate}%
              </div>
              <Progress 
                percent={parseFloat(paidConversionRate)} 
                showInfo={false}
                strokeColor="#1890ff"
                style={{ marginTop: 8 }}
              />
            </div>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ textAlign: 'center', padding: 16, background: '#fff0f6', borderRadius: 8 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>付费用户</Text>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#eb2f96' }}>
                {liteUsers + proUsers}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                (Lite: {liteUsers} | Pro: {proUsers})
              </Text>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
}
