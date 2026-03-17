# 📋 注册系统最终方案

**时间**: 2026-03-13  
**升级**: 强制邮箱验证 + 邀请码可选

---

## ✅ 最终注册流程

```
1. 昵称（必填，≥2 字符）
   ↓
2. 密码（必填，≥6 位）
   ↓
3. 邮箱（必填，有效格式）⭐
   ↓
4. 发送验证码（60 秒倒计时）
   ↓
5. 填写 6 位验证码（必填）⭐
   ↓
6. 邀请码（可选）🎯
   ↓
7. 注册成功 ✅
```

---

## 🎯 核心变更

### 1. 邮箱验证
- ✅ **强制验证** - 防止垃圾账号
- ✅ 一邮箱一号
- ✅ 支持邮箱登录

### 2. 邀请码
- ✅ **可选填写** - 降低注册门槛
- ✅ 有邀请码 → 记录邀请关系 + 奖励积分
- ✅ 没邀请码 → 直接注册

### 3. 登录方式
- ✅ 邮箱 + 密码
- ✅ 昵称 + 密码

---

## 📊 注册策略对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **仅邀请码** | 可控用户质量 | 门槛高，流失率高 |
| **仅邮箱** | 门槛低，易转化 | 可能有垃圾账号 |
| **邮箱 + 邀请码可选** ✅ | 平衡安全与转化 | 需要邮件服务 |

---

## 🎁 邀请系统（保留）

### 邀请者奖励
- ✅ 每邀请 1 人 → **+100 积分**
- ✅ 被邀请人注册 → 双方都有奖励
- ✅ 积分可领取 AI 团队（5000 积分）

### 被邀请人福利
- ✅ 使用邀请码注册 → 额外奖励
- ✅ 没有邀请码 → 正常注册（无损失）

---

## 📁 修改的文件

### 后端
```
backend/
├── routes/auth.js              ← 邀请码可选逻辑
├── services/email-service.js   ← 邮箱验证服务
├── utils/db.js                 ← 支持邮箱字段
└── config/index.js             ← 邮箱配置
```

### 前端
```
frontend/
└── index.html                  ← 邀请码输入框可选 + 表单验证
```

---

## 🔧 技术实现

### 后端 API

#### 注册 API (`POST /api/auth/register`)

**必填参数：**
```json
{
  "nickname": "用户昵称",        // ≥2 字符
  "password": "密码",            // ≥6 位
  "email": "user@example.com",  // 有效邮箱
  "code": "123456"              // 6 位验证码
}
```

**可选参数：**
```json
{
  "inviteCode": "LINGXI-XXXX"   // 可选
}
```

**处理逻辑：**
```javascript
// 邀请码可选处理
let inviterId = null;
if (inviteCode && inviteCode.trim()) {
  const codeInfo = await getInviteCodeInfo(inviteCode);
  if (!codeInfo) {
    return res.status(400).json({ error: '邀请码无效' });
  }
  inviterId = codeInfo.inviterId;
}

// 创建用户（传入 inviterId，可能为 null）
const user = await createUser('DIRECT-' + Date.now(), nickname, password, inviterId, email);
```

### 前端表单

#### 邀请码输入框
```html
<div class="home-form-group">
  <label>邀请码（可选）</label>
  <input type="text" id="registerCode" 
         placeholder="有邀请码？输入在这里（可选）">
</div>
```

**特点：**
- 无 `required` 属性
- Placeholder 提示"可选"
- 空值时后端正常处理

---

## 📈 用户体验优化

### 注册流程
```
旧流程（必须邀请码）：
用户 → 没邀请码 → ❌ 无法注册 → 流失

新流程（邀请码可选）：
用户 → 没邀请码 → 直接注册 ✅ → 转化
用户 → 有邀请码 → 填写邀请码 → 双方奖励 ✅
```

### 转化率提升
- ✅ 降低门槛 → 更多自然用户
- ✅ 保留邀请 → 老用户仍可邀请
- ✅ 邮箱验证 → 防止垃圾账号

---

## 🎯 运营策略建议

### 1. 默认邀请码
- 为新用户生成专属邀请码
- 注册后显示："你的邀请码：XXX，分享给朋友得积分"

### 2. 邀请活动
- "邀请 3 人 → 额外奖励 500 积分"
- "邀请 10 人 → 免费订阅 1 个月"

### 3. 邮箱营销
- 欢迎邮件（注册成功）
- 产品更新通知
- 活动推广（适度）

---

## 🔒 安全机制

### 防止滥用
- ✅ 邮箱验证（60 秒倒计时）
- ✅ 验证码 5 分钟过期
- ✅ 一邮箱一号
- ✅ 邀请码使用次数限制

### 邀请码验证
- ✅ 检查邀请码有效性
- ✅ 检查是否已使用
- ✅ 记录邀请关系

---

## 📝 API 完整参数

### 注册请求
```json
POST /api/auth/register
{
  "nickname": "列哥",           // 必填
  "password": "123456",         // 必填
  "email": "liege@example.com", // 必填
  "code": "123456",             // 必填
  "inviteCode": "LINGXI-XXXX"   // 可选
}
```

### 成功响应
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "nickname": "列哥",
    "email": "liege@example.com",
    "emailVerified": true,
    "inviteCode": "USER-XXXX",
    "invitedBy": null,          // 如果有邀请码，这里是邀请者 ID
    "points": 100,
    ...
  }
}
```

---

## 🚀 部署检查清单

- [ ] 配置 SendGrid API Key
- [ ] 配置发件人邮箱
- [ ] 重启后端服务
- [ ] 测试无邀请码注册
- [ ] 测试有邀请码注册
- [ ] 测试邮箱登录
- [ ] 测试昵称登录
- [ ] 检查邀请奖励

---

## 💡 未来优化

- [ ] 邀请码使用统计
- [ ] 邀请排行榜
- [ ] 邮件模板自定义
- [ ] 邮箱找回密码
- [ ] 邀请活动配置后台

---

_升级完成时间：2026-03-13 17:25_
