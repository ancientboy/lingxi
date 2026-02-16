# 灵犀云 技术架构

> 版本：v1.0
> 更新时间：2026-02-16

---

## 一、整体架构

```
┌────────────────────────────────────────────────────────────┐
│                      用户界面层                             │
│   Web（主界面）| 小程序 | 桌面端 | API                       │
├────────────────────────────────────────────────────────────┤
│                      网关层                                 │
│   CDN | 负载均衡 | API Gateway | WebSocket                 │
├────────────────────────────────────────────────────────────┤
│                      应用层                                 │
│   用户服务 | 实例管理 | 计费服务 | 配置服务                  │
├────────────────────────────────────────────────────────────┤
│                   OpenClaw 集群                             │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│   │User-A   │ │User-B   │ │User-C   │ │User-... │        │
│   │实例     │ │实例     │ │实例     │ │实例     │        │
│   └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
│         ↓           ↓           ↓           ↓             │
│   ┌──────────────────────────────────────────────┐       │
│   │              共享资源层                        │       │
│   │  模型代理 | ClawHub | 向量数据库 | 对象存储   │       │
│   └──────────────────────────────────────────────┘       │
├────────────────────────────────────────────────────────────┤
│                      数据层                                 │
│   用户数据 | 会话数据 | 记忆数据 | 计费数据                 │
└────────────────────────────────────────────────────────────┘
```

---

## 二、技术选型

### 前端

| 技术 | 用途 | 原因 |
|------|------|------|
| Next.js | 框架 | SSR + SEO + 开发效率 |
| React | UI | 生态成熟，组件丰富 |
| TailwindCSS | 样式 | 快速开发，一致性 |
| Zustand | 状态管理 | 轻量，简单 |
| Socket.io | 实时通信 | 对话流式输出 |

### 后端

| 技术 | 用途 | 原因 |
|------|------|------|
| Node.js | 运行时 | 与前端统一，OpenClaw 兼容 |
| Express | 框架 | 轻量，灵活 |
| PostgreSQL | 主数据库 | 可靠，功能全 |
| Redis | 缓存/队列 | 快速，支持 Pub/Sub |
| Docker | 容器化 | OpenClaw 实例隔离 |

### 基础设施

| 技术 | 用途 | 原因 |
|------|------|------|
| 阿里云 | 云服务商 | 国内访问快 |
| OSS | 对象存储 | 文件存储 |
| 短信服务 | 验证码 | 稳定可靠 |
| Docker Compose | 容器编排 | MVP 阶段够用 |
| K8s | 容器编排（未来）| 大规模部署 |

---

## 三、多租户架构

### 实例隔离方案

```
方案 A：共享容器 + 数据隔离（低成本）
─────────────────────────────────────
优点：成本低，资源利用率高
缺点：隔离性差，有安全风险
适用：免费用户 / 低付费用户

方案 B：独立容器（推荐）
─────────────────────────────────────
优点：隔离性好，安全可控
缺点：成本略高
适用：专业版 / 团队版

方案 C：独立虚拟机（企业版）
─────────────────────────────────────
优点：完全隔离，可自定义
缺点：成本高，管理复杂
适用：企业客户
```

### MVP 阶段方案

```
采用方案 B（独立容器）：

1. 预创建 10 个 OpenClaw 实例容器
2. 用户注册 → 分配一个空闲实例
3. 用户配置 → 更新实例的 Agent/Skills
4. 实例不够 → 自动创建新容器
```

### 容器配置

```yaml
# docker-compose.yml（单用户实例）
version: '3.8'
services:
  openclaw:
    image: openclaw/openclaw:latest
    container_name: lingxi-user-{userId}
    environment:
      - OPENCLAW_CONFIG=/config/openclaw.json
    volumes:
      - ./config/{userId}:/config
      - ./data/{userId}:/data
    ports:
      - "18789"
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

---

## 四、数据模型

### 用户表 (users)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE,
  wechat_id VARCHAR(50) UNIQUE,
  nickname VARCHAR(50),
  avatar_url TEXT,
  plan VARCHAR(20) DEFAULT 'free',  -- free, pro, team, enterprise
  instance_id VARCHAR(50),
  instance_status VARCHAR(20) DEFAULT 'pending',  -- pending, ready, error
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Agent 配置表 (agent_configs)

```sql
CREATE TABLE agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  agent_id VARCHAR(50),  -- coder, ops, inventor, etc.
  enabled BOOLEAN DEFAULT true,
  skills TEXT[],  -- 已安装的技能列表
  custom_soul TEXT,  -- 自定义 SOUL.md
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 记忆表 (memories)

```sql
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  domain VARCHAR(50),  -- coding, business, personal, etc.
  type VARCHAR(50),  -- preference, feedback, learning, etc.
  content TEXT,
  importance INT DEFAULT 5,  -- 1-10
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_memories_user_domain ON memories(user_id, domain);
CREATE INDEX idx_memories_content ON memories USING gin(to_tsvector('chinese', content));
```

### 使用记录表 (usage_logs)

```sql
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  agent_id VARCHAR(50),
  message_count INT DEFAULT 1,
  input_tokens INT,
  output_tokens INT,
  model VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user_date ON usage_logs(user_id, created_at);
```

---

## 五、API 设计

### 用户服务

```yaml
# 注册/登录
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout

# 用户信息
GET /api/user/profile
PUT /api/user/profile
```

### 实例服务

```yaml
# 实例管理
GET /api/instance/status
POST /api/instance/create
DELETE /api/instance/delete

# 对话
GET /api/instance/chat-url
WebSocket /api/instance/ws
```

### Agent 服务

```yaml
# 团队管理
GET /api/agents
POST /api/agents
DELETE /api/agents/:id

# 技能管理
GET /api/agents/:id/skills
POST /api/agents/:id/skills
DELETE /api/agents/:id/skills/:skillId
```

### 技能市场

```yaml
# 浏览技能
GET /api/skills
GET /api/skills/:id
GET /api/skills/recommend  # 推荐技能

# 安装技能
POST /api/skills/:id/install
```

---

## 六、灵犀配置流程

### 意图识别 → Agent 推荐

```javascript
// 推荐规则
const RECOMMEND_RULES = [
  {
    keywords: ['数据', '分析', '运营', '增长', '报表'],
    agents: ['ops'],
    skills: ['data-analysis', 'searxng']
  },
  {
    keywords: ['代码', '开发', 'bug', '重构', 'API'],
    agents: ['coder'],
    skills: ['code-reviewer', 'fix']
  },
  {
    keywords: ['创意', '文案', '想法', '头脑风暴'],
    agents: ['inventor'],
    skills: []
  },
  {
    keywords: ['产品', '需求', '用户', 'MVP'],
    agents: ['pm'],
    skills: []
  }
];

// 分析用户需求
function analyzeNeeds(userInput) {
  const matched = [];
  for (const rule of RECOMMEND_RULES) {
    for (const keyword of rule.keywords) {
      if (userInput.includes(keyword)) {
        matched.push(rule);
        break;
      }
    }
  }
  return matched;
}
```

### 自动配置 Agent

```javascript
// 配置 Agent
async function configureAgent(userId, agentId, skills) {
  // 1. 更新数据库
  await db.agentConfigs.create({
    user_id: userId,
    agent_id: agentId,
    skills: skills
  });
  
  // 2. 更新 OpenClaw 实例配置
  const config = await loadUserConfig(userId);
  await updateOpenClawConfig(userId, config);
  
  // 3. 重启实例（如果需要）
  await restartInstance(userId);
}
```

---

## 七、部署架构

### MVP 阶段（单机）

```
┌─────────────────────────────────────────┐
│            单台服务器                     │
│  ┌─────────────────────────────────┐   │
│  │  Nginx（反向代理）               │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  Node.js（应用服务）             │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  PostgreSQL                     │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  Docker（OpenClaw 实例池）       │   │
│  │  ├── user-1                     │   │
│  │  ├── user-2                     │   │
│  │  └── ...                        │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 扩展阶段（集群）

```
┌──────────────────────────────────────────────────────┐
│                    负载均衡                           │
└──────────────────────────────────────────────────────┘
         ↓              ↓              ↓
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  应用节点 1  │ │  应用节点 2  │ │  应用节点 3  │
└─────────────┘ └─────────────┘ └─────────────┘
         ↓              ↓              ↓
┌──────────────────────────────────────────────────────┐
│                PostgreSQL（主从）                     │
└──────────────────────────────────────────────────────┘
         ↓              ↓              ↓
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  实例池 1   │ │  实例池 2   │ │  实例池 3   │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## 八、安全设计

### 认证与授权

```
- JWT Token 认证
- 每个用户只能访问自己的实例
- API 限流（防滥用）
```

### 数据安全

```
- 密码加密存储（bcrypt）
- 敏感数据加密（AES-256）
- HTTPS 强制
- 定期备份
```

### 实例隔离

```
- Docker 网络隔离
- 资源限制（CPU/内存）
- 文件系统隔离
- 日志分离
```

---

## 九、监控与运维

### 监控指标

```
- 实例数量 / 状态
- CPU / 内存使用率
- 请求响应时间
- 错误率
- 用户活跃度
```

### 告警规则

```
- 实例创建失败 → 立即告警
- CPU > 80% → 预警
- 内存 > 90% → 预警
- 错误率 > 5% → 预警
```

### 日志收集

```
- 应用日志：/var/log/lingxi-cloud/
- 实例日志：Docker logs
- 访问日志：Nginx logs
```

---

*文档维护：云溪 💻 + 灵犀团队*
