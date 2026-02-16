# 灵犀云 开发任务清单

> 版本：v1.0
> 更新时间：2026-02-16

---

## 状态说明

- ⬜ 未开始
- 🔄 进行中
- ✅ 已完成
- ❌ 暂缓

---

## Day 1：基础搭建

### 环境准备

- ⬜ 安装 Node.js 18+
- ⬜ 安装 PostgreSQL
- ⬜ 安装 Docker
- ⬜ 准备阿里云短信 AccessKey

### 项目初始化

- ⬜ 创建项目目录
  ```bash
  mkdir -p lingxi-cloud/{frontend,backend,deploy}
  cd lingxi-cloud/backend
  npm init -y
  ```

- ⬜ 安装依赖
  ```bash
  npm install express pg redis cors jsonwebtoken bcrypt
  npm install -D nodemon
  ```

- ⬜ 配置 ESLint
  ```bash
  npm install -D eslint prettier
  npx eslint --init
  ```

### 数据库

- ⬜ 创建数据库
  ```sql
  CREATE DATABASE lingxi_cloud;
  ```

- ⬜ 创建用户表
  ```sql
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    nickname VARCHAR(50),
    avatar_url TEXT,
    plan VARCHAR(20) DEFAULT 'free',
    instance_id VARCHAR(50),
    instance_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  ```

- ⬜ 创建验证码表
  ```sql
  CREATE TABLE verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expired_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```

### 后端 API

- ⬜ 创建 Express 应用
  ```javascript
  // backend/index.js
  const express = require('express');
  const app = express();
  app.use(express.json());
  // ...
  ```

- ⬜ 实现发送验证码接口
  ```javascript
  // POST /api/auth/send-code
  // 1. 验证手机号格式
  // 2. 调用阿里云短信 API
  // 3. 保存验证码到数据库
  ```

- ⬜ 实现注册/登录接口
  ```javascript
  // POST /api/auth/login
  // 1. 验证验证码
  // 2. 查找/创建用户
  // 3. 生成 JWT
  // 4. 返回用户信息
  ```

- ⬜ 实现实例分配接口
  ```javascript
  // GET /api/instance/assign
  // 1. 查找空闲实例
  // 2. 分配给用户
  // 3. 返回实例 URL
  ```

### OpenClaw 实例池

- ⬜ 编写实例创建脚本
  ```bash
  # deploy/create-instances.sh
  for i in {1..10}; do
    docker run -d --name lingxi-user-$i \
      -p 1878$i:18789 \
      -v /data/lingxi/config-$i:/config \
      openclaw/openclaw:latest
  done
  ```

- ⬜ 创建实例管理脚本
  ```bash
  # deploy/manage-instances.sh
  # list, status, restart, etc.
  ```

- ⬜ 预创建 10 个实例

### 前端页面

- ⬜ 创建登录页面
  ```html
  <!-- frontend/login.html -->
  <form id="login-form">
    <input type="tel" placeholder="手机号" />
    <button type="button" id="send-code">获取验证码</button>
    <input type="text" placeholder="验证码" />
    <button type="submit">登录</button>
  </form>
  ```

- ⬜ 实现登录逻辑
  ```javascript
  // frontend/login.js
  // 发送验证码 -> 验证登录 -> 跳转
  ```

---

## Day 2：团队配置 + 新用户引导

### 灵犀新用户引导

- ⬜ 更新 SOUL.md - 添加新用户判断逻辑
  ```markdown
  ## 每次对话开始
  
  调用 checkFirstTimeUser() 判断是否新用户
  
  if (isFirstTime) {
    // 执行新用户引导流程
  } else {
    // 正常对话
  }
  ```

- ⬜ 更新记忆系统 - onboarding 标记
  ```javascript
  // skills/memory-system/lingxi-integration.mjs
  
  export async function checkFirstTimeUser() {
    const profile = await getUserProfile();
    return { 
      isFirstTime: !profile?.onboarding_completed,
      profile 
    };
  }
  
  export async function markOnboardingCompleted(agents) {
    await add('onboarding_completed', { 
      domain: 'personal', 
      type: 'milestone',
      importance: 9 
    });
    await add(`团队配置: ${agents.join(', ')}`, { 
      domain: 'business',
      type: 'decision',
      importance: 8 
    });
  }
  ```

- ⬜ 编写引导话术
  ```markdown
  # 新用户引导话术
  
  ## Step 1: 问候
  "你好！我是灵犀，你的 AI 团队队长 ⚡
   看起来你是第一次来，让我先了解一下你～"
  
  ## Step 2: 询问职业
  "请问你主要是做什么工作的？"
  
  ## Step 3: 了解需求
  "平时工作中，最常做哪些事？"
  
  ## Step 4: 推荐配置
  "根据你的需求，我建议配置：
   - 若曦 📊 运营专家
   - 紫萱 💡 创意天才
   要帮你配置好吗？"
  
  ## Step 5: 确认并执行
  "好的，正在为你配置团队...
   ✅ 若曦已加入
   ✅ 紫萱已加入
   ✅ 配置完成！你现在可以开始使用了！"
  ```

- ⬜ 编写推荐规则
  ```javascript
  // backend/recommend-rules.js
  
  const RECOMMEND_RULES = [
    {
      keywords: ['电商', '运营', '数据', '增长'],
      agents: ['ops'],
      skills: ['data-analysis', 'searxng'],
      reason: '运营专家适合数据分析、增长策略'
    },
    {
      keywords: ['代码', '开发', 'bug', '重构', '程序'],
      agents: ['coder'],
      skills: ['code-reviewer', 'fix'],
      reason: '代码专家适合开发、调试、重构'
    },
    {
      keywords: ['产品', '需求', '用户', 'MVP'],
      agents: ['pm'],
      skills: ['task-planner'],
      reason: '产品专家适合需求分析、产品规划'
    },
    {
      keywords: ['创意', '文案', '想法', '头脑风暴', '内容'],
      agents: ['inventor'],
      skills: ['searxng'],
      reason: '创意专家适合内容创作、头脑风暴'
    }
  ];
  
  function analyzeUserNeed(userInput) {
    const matched = [];
    for (const rule of RECOMMEND_RULES) {
      for (const keyword of rule.keywords) {
        if (userInput.includes(keyword)) {
          matched.push(rule);
          break;
        }
      }
    }
    return matched.length > 0 ? matched : [getDefaultRule()];
  }
  ```

### Agent 动态配置

- ⬜ 实现 Agent 配置接口
  ```javascript
  // POST /api/agents/configure
  
  async function configureAgents(req, res) {
    const { userId, agents, skills } = req.body;
    
    // 1. 获取用户实例信息
    const user = await db.users.findById(userId);
    
    // 2. 更新 OpenClaw 配置
    await updateOpenClawConfig(user.instance_id, { agents, skills });
    
    // 3. 重启实例
    await restartInstance(user.instance_id);
    
    // 4. 保存配置到数据库
    await db.agentConfigs.upsert({ userId, agents, skills });
    
    // 5. 返回结果
    res.json({ success: true, agents, skills });
  }
  ```

- ⬜ 实现 OpenClaw 配置更新
  ```javascript
  // backend/openclaw-config.js
  
  async function updateOpenClawConfig(instanceId, config) {
    const configPath = `/data/lingxi/${instanceId}/openclaw.json`;
    
    // 1. 读取现有配置
    const currentConfig = JSON.parse(fs.readFileSync(configPath));
    
    // 2. 更新 agents.list
    currentConfig.agents.list = [
      { id: 'main', default: true, name: '灵犀' },
      ...config.agents.map(id => ({
        id,
        name: AGENT_NAMES[id],
        workspace: `/home/admin/.openclaw/workspace-${id}`
      }))
    ];
    
    // 3. 更新 tools.subagents.allow
    currentConfig.tools.subagents.tools.allow.push(...config.agents);
    
    // 4. 写入配置
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
  }
  ```

- ⬜ 实现实例重启 + 状态监控
  ```javascript
  // backend/instance-manager.js
  
  async function restartInstance(instanceId) {
    // 1. 重启容器
    await exec(`docker restart ${instanceId}`);
    
    // 2. 等待就绪
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      try {
        const res = await fetch(`http://${instanceId}:18789/status`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (e) {}
    }
    
    if (!ready) {
      throw new Error('Instance restart timeout');
    }
    
    return { success: true };
  }
  ```

- ⬜ 实现配置进度通知（灵犀侧）
  ```javascript
  // 灵犀在配置完成后发送消息
  
  // 方式1: 通过 WebSocket 推送
  // 方式2: 写入临时文件，灵犀轮询读取
  // 方式3: 调用灵犀的内部 API
  ```

### 团队展示页面

- ⬜ 创建团队页面
  ```html
  <!-- frontend/team.html -->
  <h1>我的 AI 团队</h1>
  <div id="team-list">
    <!-- 动态加载 -->
  </div>
  ```

- ⬜ 实现团队数据加载
  ```javascript
  // frontend/team.js
  // 从 API 获取团队数据
  // 渲染列表
  ```

### 对话页面

- ⬜ 集成 OpenClaw webchat
  ```html
  <!-- 嵌入 webchat iframe -->
  <iframe src="http://instance-url:18789" />
  ```

- ⬜ 或者跳转到 webchat
  ```javascript
  window.location.href = instanceUrl;
  ```

---

## Day 3：打磨上线

### Bug 修复

- ⬜ 修复已知问题
- ⬜ 优化用户体验
- ⬜ 添加错误提示

### 落地页

- ⬜ 创建简单落地页
  ```html
  <h1>灵犀云</h1>
  <p>一键拥有你的 AI 团队</p>
  <a href="/login">免费试用</a>
  ```

- ⬜ 添加产品介绍

### 部署

- ⬜ 配置 Nginx
  ```nginx
  server {
    listen 80;
    server_name lingxi.cloud;
    
    location /api {
      proxy_pass http://localhost:3000;
    }
    
    location / {
      root /var/www/lingxi-cloud/frontend;
    }
  }
  ```

- ⬜ 配置 HTTPS（可选）
- ⬜ 启动后端服务
  ```bash
  pm2 start backend/index.js --name lingxi-cloud
  ```

### 测试

- ⬜ 注册流程测试
- ⬜ 登录流程测试
- ⬜ 对话流程测试
- ⬜ 配置流程测试

### 上线

- ⬜ 部署到生产服务器
- ⬜ 域名解析
- ⬜ 开放注册（限制数量）

---

## 后续任务

### Week 2

- ⬜ 技能市场
- ⬜ 计费系统
- ⬜ 团队管理完善

### Week 3-4

- ⬜ 微信小程序
- ⬜ 高级记忆
- ⬜ 自动扩容

---

## 快速命令

```bash
# 启动开发
cd lingxi-cloud/backend && npm run dev

# 创建实例
bash deploy/create-instances.sh

# 查看实例状态
docker ps | grep lingxi-user

# 重启实例
docker restart lingxi-user-1

# 查看日志
docker logs lingxi-user-1
```

---

*更新者：灵犀团队*
