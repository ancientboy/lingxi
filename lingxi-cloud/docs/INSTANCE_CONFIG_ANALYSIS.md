# 灵犀云实例配置分析报告

> 分析时间: 2026-02-23
> 目的: 检查一键领取AI团队流程中的配置问题

---

## 一、问题汇总

### 🔴 严重问题

| # | 问题描述 | 影响 | 位置 |
|---|---------|------|------|
| 1 | `OPENCLAW_CONFIG_PATH` 硬编码 | 其他用户无法配置 Agent | `routes/instance.js:29` |
| 2 | `createInstance` 配置不完整 | Gateway 无法正常启动 | `routes/instance.js:75-91` |
| 3 | MVP 模式 Token/Session 硬编码 | 多用户冲突风险 | `routes/instance.js:22-24` |
| 4 | 没有自动生成 token | 安全风险 | 全局 |

### 🟡 中等问题

| # | 问题描述 | 影响 | 位置 |
|---|---------|------|------|
| 5 | 没有自动生成 basePath | 会话冲突 | `routes/instance.js` |
| 6 | allowedOrigins 未动态配置 | CORS 错误 | `routes/instance.js` |
| 7 | 未自动检测用户目录 | 路径错误 | `routes/instance.js` |

### 🟢 低优先级

| # | 问题描述 | 影响 | 位置 |
|---|---------|------|------|
| 8 | 无配置验证 | 可能启动失败 | `routes/instance.js` |
| 9 | 无健康检查 | 无法自动恢复 | `routes/instance.js` |

---

## 二、代码问题详解

### 问题 1: 硬编码配置路径

**代码:**
```javascript
// routes/instance.js:29
const OPENCLAW_CONFIG_PATH = '/home/admin/.openclaw/agents_config.json';
```

**问题:** 
- 在其他服务器上，用户可能是 `root` 或其他用户
- 路径不存在会导致配置失败

**修复:**
```javascript
const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME || '/root', '.openclaw/agents_config.json');
```

---

### 问题 2: createInstance 配置不完整

**代码:**
```javascript
// routes/instance.js:75-91
const baseConfig = {
  agents: {
    defaults: { model: { primary: 'zhipu/glm-5' }, workspace: '/workspace' },
    list: [{ id: 'main', default: true, name: '灵犀' }]
  },
  tools: { subagents: { tools: { allow: [] } } }
};
```

**问题:**
- 缺少 `gateway` 配置
- 缺少 `controlUi` 配置 (allowedOrigins)
- 缺少 `auth` 配置 (token)
- 缺少 `basePath` 配置

**需要添加:**
```javascript
const crypto = require('crypto');
const instanceToken = crypto.randomBytes(16).toString('hex');
const basePath = crypto.randomBytes(4).toString('hex');

const baseConfig = {
  agents: { ... },
  gateway: {
    port: 18789,
    mode: 'local',
    bind: 'lan',
    controlUi: {
      enabled: true,
      basePath: basePath,
      allowedOrigins: [
        '*',
        `http://${SERVER_IP}:3000`,
        'http://localhost:3000'
      ],
      allowInsecureAuth: true
    },
    auth: {
      mode: 'token',
      token: instanceToken
    }
  }
};
```

---

### 问题 3: MVP 模式硬编码

**代码:**
```javascript
// routes/instance.js:22-24
const MVP_OPENCLAW_TOKEN = process.env.MVP_OPENCLAW_TOKEN || '6f3719a52fa12799fea8e4a06655703f';
const MVP_OPENCLAW_SESSION = process.env.MVP_OPENCLAW_SESSION || 'c308f1f0';
```

**问题:**
- 所有用户共享同一个 token 和 session
- 存在安全风险
- 无法区分用户

---

### 问题 4: 用户服务器配置不匹配

当用户手动配置服务器时，数据库中存储了：
- `openclawToken`: 服务器实际的 token
- `openclawSession`: 服务器实际的 basePath
- `ip`: 服务器 IP

但前端获取连接信息时（`gateway.js`），需要正确返回这些信息。

---

## 三、配置自动生成清单

### 服务器初始化时需要自动生成/检测：

| 配置项 | 生成方式 | 说明 |
|--------|----------|------|
| 用户目录 | `process.env.HOME` 或 `os.homedir()` | 自动检测 |
| 服务器 IP | `curl ifconfig.me` 或传入 | 自动检测/配置 |
| Gateway Token | `crypto.randomBytes(16).toString('hex')` | 随机生成 |
| Session basePath | `crypto.randomBytes(4).toString('hex')` | 随机生成 |
| allowedOrigins | 包含灵犀云服务器地址 | 动态配置 |
| 工作目录 | `~/.openclaw/workspace` | 自动创建 |

### 需要验证的配置：

| 配置项 | 验证方式 |
|--------|----------|
| 目录存在 | `fs.access()` |
| 端口可用 | `net.listen()` 测试 |
| JSON 格式 | `JSON.parse()` |
| Token 格式 | 长度/字符检查 |

---

## 四、修复优先级

### Phase 1 - 立即修复 (今天)

1. **修复硬编码路径**
   - 文件: `routes/instance.js`
   - 改为动态检测

2. **添加完整配置生成**
   - 文件: `routes/instance.js`
   - 添加 gateway、controlUi、auth 配置

3. **更新用户服务器记录**
   - 确保 token、session 正确保存
   - 确保前端能正确获取

### Phase 2 - 本周完成

4. **添加配置验证**
5. **添加健康检查**
6. **添加自动修复脚本**

---

## 五、测试用例

### 测试 1: 新用户领取团队

```
1. 新用户注册
2. 获得积分
3. 领取团队
4. 验证: 能正常对话
```

### 测试 2: 手动添加服务器

```
1. 用户手动配置服务器
2. 填写 IP、密码
3. 系统自动配置 OpenClaw
4. 验证: 能正常连接
```

### 测试 3: 复制配置迁移

```
1. 从其他服务器复制配置
2. 运行修复脚本
3. 验证: 路径、Token、CORS 正确
```

---

## 六、代码修改建议

### routes/instance.js 修改

```javascript
// 1. 动态获取用户目录
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/root';
const OPENCLAW_CONFIG_DIR = path.join(HOME_DIR, '.openclaw');

// 2. 生成随机配置
const crypto = require('crypto');
function generateInstanceConfig(serverIp) {
  return {
    token: crypto.randomBytes(16).toString('hex'),
    basePath: crypto.randomBytes(4).toString('hex'),
    allowedOrigins: [
      '*',
      `http://${serverIp}:3000`,
      'http://localhost:3000'
    ]
  };
}

// 3. 完整的配置模板
function createFullConfig(instanceConfig, agents) {
  return {
    agents: {
      defaults: { model: { primary: 'zhipu/glm-5' }, workspace: '/workspace' },
      list: agents.map(id => ({ id, name: AGENT_NAMES[id] || id }))
    },
    gateway: {
      port: 18789,
      mode: 'local',
      bind: 'lan',
      controlUi: {
        enabled: true,
        basePath: instanceConfig.basePath,
        allowedOrigins: instanceConfig.allowedOrigins,
        allowInsecureAuth: true
      },
      auth: {
        mode: 'token',
        token: instanceConfig.token
      }
    }
  };
}
```

---

*分析完成，等待确认后开始修复*
