# 灵犀云 MVP 开发计划

> 版本：v1.0
> 目标：2-3 天上线第一版
> 更新时间：2026-02-16

---

## 一、MVP 目标

### 核心验证

**验证一件事：** 用户是否愿意用「灵犀配置团队」这个方式？

### 成功标准

- ✅ 用户能注册
- ✅ 用户能跟灵犀对话
- ✅ 灵犀能推荐团队配置
- ✅ 用户能确认并使用配置好的团队

---

## 二、MVP 范围

### 必须有（P0）

| 功能 | 说明 | 预计耗时 |
|------|------|----------|
| 用户注册/登录 | 手机验证码 | 0.5天 |
| 创建实例 | 预创建实例池 | 0.5天 |
| Web 对话 | 复用 OpenClaw webchat | 0天 |
| 灵犀对话 | 已有，直接用 | 0天 |
| 团队配置向导 | 对话引导 | 1天 |
| 团队展示 | 简单页面 | 0.5天 |

**总计：2.5天**

### 暂不做（后续迭代）

- ❌ 技能市场浏览
- ❌ 计费系统
- ❌ 多渠道接入
- ❌ 高级记忆管理

---

## 三、Day 1：基础搭建

### 上午（4小时）

**任务清单：**

- [ ] 项目初始化
  ```bash
  mkdir lingxi-cloud
  cd lingxi-cloud
  npm init -y
  npm install express pg redis cors
  ```

- [ ] 数据库设计
  ```sql
  -- 创建用户表
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE,
    instance_id VARCHAR(50),
    instance_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```

- [ ] 注册接口
  ```javascript
  // POST /api/auth/register
  // 1. 验证手机号
  // 2. 发送验证码
  // 3. 创建用户记录
  ```

### 下午（4小时）

**任务清单：**

- [ ] 预创建 OpenClaw 实例池
  ```bash
  # 创建 10 个实例
  for i in {1..10}; do
    docker run -d --name lingxi-user-$i \
      -p 1878$i:18789 \
      openclaw/openclaw:latest
  done
  ```

- [ ] 实例分配逻辑
  ```javascript
  // 用户注册后分配空闲实例
  async function assignInstance(userId) {
    const instance = await findFreeInstance();
    await db.users.update(userId, {
      instance_id: instance.id,
      instance_status: 'ready'
    });
    return instance;
  }
  ```

- [ ] 跳转到 webchat
  ```javascript
  // 用户登录后跳转
  res.redirect(`http://instance-ip:18789?token=${jwt}`);
  ```

**交付物：**
- 用户能注册
- 能跳转到对话界面
- 能跟灵犀对话

---

## 四、Day 2：团队配置 + 新用户引导

### 上午（4小时）

**任务清单：**

- [ ] 更新灵犀 SOUL.md - 新用户引导逻辑
  ```markdown
  ## 每次对话开始
  
  1. 调用记忆系统，查询用户画像
  2. 如果画像为空 → 执行「新用户引导流程」
  3. 如果画像存在 → 正常对话
  
  ### 新用户引导流程
  1. 问候：「你好！我是灵犀，你的 AI 团队队长 ⚡」
  2. 询问：「请问你主要是做什么工作的？」
  3. 了解：「平时工作中，最常做哪些事？」
  4. 推荐：「根据你的需求，我建议配置...」
  5. 确认：「要帮你配置好吗？」
  6. 保存用户画像
  7. 调用配置接口
  8. 显示进度：「正在配置... ✅ 完成」
  ```

- [ ] 更新记忆系统 - 支持 onboarding 标记
  ```javascript
  // lingxi-integration.mjs
  export async function checkFirstTimeUser() {
    const profile = await getUserProfile();
    return { isFirstTime: !profile?.onboarding_completed };
  }
  
  export async function markOnboardingCompleted(agents) {
    await rememberPreference('onboarding_completed', true);
    await rememberPreference('team_agents', agents);
  }
  ```

- [ ] 编写推荐规则
  ```javascript
  const RECOMMEND_RULES = {
    '电商': { agents: ['ops'], skills: ['data-analysis'] },
    '代码': { agents: ['coder'], skills: ['code-reviewer'] },
    '产品': { agents: ['pm'], skills: ['task-planner'] },
    '创意': { agents: ['inventor'], skills: [] }
  };
  ```

### 下午（4小时）

**任务清单：**

- [ ] 实现 Agent 配置接口
  ```javascript
  // POST /api/agents/configure
  // body: { userId, agents: ['ops', 'inventor'] }
  // 1. 更新 OpenClaw 配置文件
  // 2. 重启实例
  // 3. 等待就绪
  // 4. 保存到记忆
  ```

- [ ] 实现 OpenClaw 配置更新
  ```javascript
  async function updateOpenClawConfig(userId, agents) {
    // 1. 读取配置模板
    // 2. 添加 Agent 配置
    // 3. 写入用户实例目录
  }
  ```

- [ ] 实现实例重启 + 状态通知
  ```javascript
  async function restartInstance(instanceId) {
    // 1. 重启实例
    await exec(`docker restart ${instanceId}`);
    // 2. 等待就绪
    await waitForReady(instanceId);
    // 3. 通知灵犀发送完成消息
  }
  ```

- [ ] 内部测试
  - [ ] 新用户引导流程
  - [ ] 配置推荐准确性
  - [ ] 实例重启流程

**交付物：**
- 灵犀能识别新用户
- 灵犀能引导配置
- 配置后实例能正常重启
- 团队配置完成可用

---

## 五、Day 3：打磨上线

### 上午（4小时）

**任务清单：**

- [ ] 修复内测问题
- [ ] 简单落地页
  ```html
  <h1>灵犀云 - 一键拥有你的 AI 团队</h1>
  <p>让灵犀帮你配置专属的 AI 助手团队</p>
  <button>免费试用</button>
  ```
- [ ] 部署上线
  ```bash
  # 部署到服务器
  scp -r lingxi-cloud user@server:/app/
  ssh user@server "cd /app/lingxi-cloud && npm start"
  ```

### 下午（4小时）

**任务清单：**

- [ ] 找 3-5 个用户测试
- [ ] 收集反馈
  - [ ] 注册是否顺利？
  - [ ] 配置是否易懂？
  - [ ] 是否愿意继续用？
- [ ] 快速修复问题

**交付物：**
- 可对外测试的 MVP
- 用户反馈记录

---

## 六、技术简化方案

### 为什么能 2-3 天完成？

| 原本需要 | 简化方案 | 节省时间 |
|---------|---------|---------|
| 自动创建实例 | 预创建实例池 | 0.5天 |
| 自己做对话 UI | 复用 OpenClaw webchat | 1天 |
| 复杂配置系统 | 对话引导 + 手动后台 | 0.5天 |
| 技能市场 | 先不做 | 1天 |
| 计费系统 | 先不做 | 1天 |

### MVP 技术栈

```
前端：纯 HTML + CSS（无框架）
后端：Express.js
数据库：PostgreSQL
实例：Docker（手动管理）
认证：JWT
短信：阿里云
```

---

## 七、风险预案

| 风险 | 可能性 | 应对 |
|------|--------|------|
| 实例不够用 | 中 | 先限制注册，每验证一个再创建 |
| 灵犀对话不智能 | 高 | 先用固定话术模板 |
| 用户不会用 | 高 | 加简单引导文字 |
| 服务器资源不足 | 低 | 先限制并发用户数 |

---

## 八、后续迭代

### Week 2

- [ ] 技能市场
- [ ] 计费系统
- [ ] 团队管理页面

### Week 3-4

- [ ] 微信小程序
- [ ] 高级记忆管理
- [ ] 自动扩容

### Month 2+

- [ ] 团队协作
- [ ] 企业版
- [ ] 私有部署

---

## 九、资源需求

### 人力

- 产品：1人（梓萱）
- 前端：1人
- 后端：1人
- 测试：用户自己

### 服务器

- 配置：4核8G
- 预算：¥200/月
- 支持：20-50 并发用户

### 第三方服务

- 阿里云短信：¥0.045/条
- 阿里云 OSS：¥0.12/GB
- 域名：¥50/年

---

*文档维护：灵犀团队*
