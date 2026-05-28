/**
 * 代理调用统计页面
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Spin, Typography, Space, Select, Tooltip, Progress } from 'antd';
import {
  ApiOutlined,
  CloudServerOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

// 代理统计直接走 13000 端口（通过管理后台 API 代理）
const PROXY_STATS_BASE = '/api/admin/proxy-stats';

export default function ProxyStats() {
  const [stats, setStats] = useState(null);
  const [days, setDays] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ipDetail, setIpDetail] = useState(null);
  const [ipDetailIp, setIpDetailIp] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(PROXY_STATS_BASE);
      setStats(res.data || res);
    } catch (err) {
      console.error('加载代理统计失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDays = useCallback(async () => {
    try {
      const res = await axios.get(`${PROXY_STATS_BASE}/days`);
      setDays(res.data?.days || res.days || []);
    } catch (err) {
      console.error('加载每日统计失败:', err);
    }
  }, []);

  const loadIpDetail = useCallback(async (ip) => {
    try {
      const res = await axios.get(`${PROXY_STATS_BASE}/ip/${ip}`);
      setIpDetail(res.data);
      setIpDetailIp(ip);
    } catch (err) {
      console.error('加载IP详情失败:', err);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadDays();
    const timer = setInterval(loadStats, 30000);
    return () => clearInterval(timer);
  }, [loadStats, loadDays]);

  if (loading && !stats) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  const today = stats?.today || {};
  const allTime = stats?.allTime || {};
  const topIps = stats?.topIps || [];
  const hourlyTrend = stats?.hourlyTrend || [];

  // 找出有请求的小时
  const activeHours = hourlyTrend.filter(h => h.total > 0);
  const maxHourly = Math.max(...hourlyTrend.map(h => h.total), 1);

  // Provider 中文映射
  const providerNames = {
    zhipu: '智谱 AI',
    aliyun: '阿里云百炼',
    dmxapi: 'DMXAPI（免费）'
  };

  // IP 表格列
  const ipColumns = [
    {
      title: 'IP 地址',
      dataIndex: 'ip',
      key: 'ip',
      render: (ip) => (
        <a onClick={() => loadIpDetail(ip)} style={{ fontFamily: 'monospace' }}>{ip}</a>
      )
    },
    {
      title: '今日请求',
      dataIndex: 'today',
      key: 'today',
      sorter: (a, b) => (a.today || 0) - (b.today || 0),
      render: (v) => <Text strong>{v || 0}</Text>
    },
    {
      title: '累计请求',
      dataIndex: 'total',
      key: 'total',
      sorter: (a, b) => (a.total || 0) - (b.total || 0),
      render: (v) => v?.toLocaleString() || 0
    },
    {
      title: '常用模型',
      dataIndex: 'models',
      key: 'models',
      render: (models) => {
        if (!models) return '-';
        const sorted = Object.entries(models).sort((a, b) => b[1] - a[1]).slice(0, 2);
        return sorted.map(([m, c]) => <Tag key={m} color="blue">{m} ({c})</Tag>);
      }
    },
    {
      title: 'Provider',
      dataIndex: 'byProvider',
      key: 'byProvider',
      render: (bp) => {
        if (!bp) return '-';
        return Object.entries(bp).map(([p, s]) => (
          <Tag key={p} color={s.err429 > 0 ? 'orange' : 'green'}>
            {providerNames[p] || p}: {s.req}次 {s.err429 > 0 && `⚠${s.err429}`}
          </Tag>
        ));
      }
    },
    {
      title: '最后请求',
      dataIndex: 'lastRequest',
      key: 'lastRequest',
      render: (v) => v ? new Date(v).toLocaleString('zh-CN') : '-'
    },
  ];

  // 每日统计列
  const dayColumns = [
    {
      title: '日期',
      dataIndex: 'day',
      key: 'day',
    },
    {
      title: '总请求',
      dataIndex: 'total',
      key: 'total',
      sorter: (a, b) => a.total - b.total,
      render: (v) => v?.toLocaleString() || 0
    },
    {
      title: '独立IP',
      dataIndex: 'uniqueIps',
      key: 'uniqueIps',
    },
    {
      title: 'Provider 分布',
      dataIndex: 'byProvider',
      key: 'byProvider',
      render: (bp) => {
        if (!bp) return '-';
        return Object.entries(bp).map(([p, s]) => (
          <Tag key={p} color="blue">{providerNames[p] || p}: {s.req}</Tag>
        ));
      }
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          📊 代理调用统计
        </Title>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <ClockCircleOutlined /> 自动刷新 30s
          </Text>
          <a onClick={() => { loadStats(); loadDays(); }} style={{ cursor: 'pointer' }}>
            <ReloadOutlined /> 刷新
          </a>
        </Space>
      </div>

      {/* 今日概览 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日请求"
              value={today.total || 0}
              prefix={<ApiOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日独立IP"
              value={today.uniqueIps || 0}
              prefix={<CloudServerOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="累计总请求"
              value={allTime.totalRequests || 0}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="累计独立IP"
              value={allTime.totalIps || 0}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 今日 Provider 分布 */}
      <Card title="🔑 今日 Provider 调用分布" style={{ marginTop: 16 }}>
        <Row gutter={[16, 16]}>
          {Object.entries(today.byProvider || {}).length > 0 ? (
            Object.entries(today.byProvider).map(([provider, s]) => (
              <Col xs={24} sm={8} key={provider}>
                <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, textAlign: 'center' }}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    {providerNames[provider] || provider}
                  </Text>
                  <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1890ff' }}>
                    {s.req}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Tag color="green"><CheckCircleOutlined /> 成功 {s.ok}</Tag>
                    {s.err429 > 0 && <Tag color="orange"><WarningOutlined /> 429限流 {s.err429}</Tag>}
                  </div>
                  {s.req > 0 && (
                    <Progress
                      percent={Math.round((s.ok / s.req) * 100)}
                      size="small"
                      status={s.err429 > s.ok ? 'exception' : 'active'}
                      style={{ marginTop: 8 }}
                    />
                  )}
                </div>
              </Col>
            ))
          ) : (
            <Col span={24}>
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '20px 0' }}>
                今日暂无请求
              </Text>
            </Col>
          )}
        </Row>
      </Card>

      {/* 24小时趋势 */}
      <Card title="📈 24小时请求趋势" style={{ marginTop: 16 }}>
        <div style={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 2, overflow: 'hidden' }}>
          {hourlyTrend.map((h, i) => {
            const heightPct = h.total > 0 ? Math.max((h.total / maxHourly) * 100, 5) : 0;
            const isActive = h.total > 0;
            return (
              <Tooltip key={i} title={
                `${h.hour}\n总请求: ${h.total}` +
                (h.byProvider ? '\n' + Object.entries(h.byProvider).map(([p, s]) => `${providerNames[p] || p}: ${s.req}`).join('\n') : '')
              }>
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  height: '100%'
                }}>
                  <div style={{
                    width: '100%',
                    height: `${heightPct}%`,
                    backgroundColor: isActive ? '#1890ff' : '#f0f0f0',
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 0.3s ease',
                    minHeight: isActive ? '4px' : '2px',
                    position: 'relative'
                  }}>
                    {isActive && h.total > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '-18px',
                        width: '100%',
                        textAlign: 'center',
                        fontSize: 10,
                        color: '#666',
                        whiteSpace: 'nowrap'
                      }}>
                        {h.total}
                      </div>
                    )}
                  </div>
                  <div style={{
                    fontSize: 9,
                    color: '#999',
                    marginTop: 4,
                    transform: 'rotate(-45deg)',
                    transformOrigin: 'top',
                    whiteSpace: 'nowrap'
                  }}>
                    {h.hour?.substring(11, 16)}
                  </div>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </Card>

      {/* IP 排行 */}
      <Card title="👥 IP 调用排行" style={{ marginTop: 16 }}>
        <Table
          dataSource={topIps}
          columns={ipColumns}
          rowKey="ip"
          size="small"
          pagination={false}
        />
      </Card>

      {/* IP 详情弹窗 */}
      {ipDetail && (
        <Card
          title={`🔍 IP 详情: ${ipDetailIp}`}
          style={{ marginTop: 16 }}
          extra={<a onClick={() => { setIpDetail(null); setIpDetailIp(null); }}>关闭</a>}
        >
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Statistic title="累计请求" value={ipDetail.total || 0} />
            </Col>
            <Col span={8}>
              <Statistic title="今日请求" value={ipDetail.today || 0} />
            </Col>
            <Col span={8}>
              <Statistic title="最后请求" valueStyle={{ fontSize: 14 }} value={ipDetail.lastRequest ? new Date(ipDetail.lastRequest).toLocaleString('zh-CN') : '-'} />
            </Col>
          </Row>

          {ipDetail.models && Object.keys(ipDetail.models).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Text strong>模型使用：</Text>
              <div style={{ marginTop: 8 }}>
                {Object.entries(ipDetail.models)
                  .sort((a, b) => b[1] - a[1])
                  .map(([m, c]) => (
                    <Tag key={m} color="blue" style={{ marginBottom: 4 }}>{m}: {c}次</Tag>
                  ))}
              </div>
            </div>
          )}

          {ipDetail.byProvider && (
            <div style={{ marginTop: 16 }}>
              <Text strong>Provider 分布：</Text>
              <div style={{ marginTop: 8 }}>
                {Object.entries(ipDetail.byProvider).map(([p, s]) => (
                  <Tag key={p} color={s.err429 > 0 ? 'orange' : 'green'} style={{ marginBottom: 4 }}>
                    {providerNames[p] || p}: {s.req}次 (成功{s.ok}, 429: {s.err429})
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {ipDetail.dailyHistory && Object.keys(ipDetail.dailyHistory).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Text strong>每日请求历史：</Text>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {Object.entries(ipDetail.dailyHistory)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .slice(0, 14)
                  .map(([day, count]) => (
                    <div key={day} style={{
                      padding: '4px 8px',
                      background: count > 100 ? '#fff2e8' : count > 0 ? '#e6f7ff' : '#fafafa',
                      borderRadius: 4,
                      fontSize: 12
                    }}>
                      <div style={{ color: '#999' }}>{day.substring(5)}</div>
                      <div style={{ fontWeight: 'bold' }}>{count}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 每日统计 */}
      {days && days.length > 0 && (
        <Card title="📅 每日统计" style={{ marginTop: 16 }}>
          <Table
            dataSource={days}
            columns={dayColumns}
            rowKey="day"
            size="small"
            pagination={{ pageSize: 7 }}
          />
        </Card>
      )}
    </div>
  );
}
