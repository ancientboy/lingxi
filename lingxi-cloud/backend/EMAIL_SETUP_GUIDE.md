# 📧 邮箱验证码配置指南（强制验证版）

## 🎯 重要变更

**从 2026-03-13 起，注册流程升级为强制邮箱验证：**

### ✅ 新注册流程
```
1. 填写邀请码（必填）
2. 填写昵称（必填，至少 2 字符）
3. 填写密码（必填，至少 6 位）
4. 填写邮箱（必填，有效格式）
5. 点击"发送验证码"
6. 填写 6 位验证码（必填）
7. 点击"注册"
```

### ✅ 登录流程（支持邮箱）
```
方式 1：邮箱 + 密码
方式 2：昵称 + 密码
```

---

## 1️⃣ 注册 SendGrid（免费）

### 步骤：
1. 访问 https://sendgrid.com
2. 点击 **Sign Up** 注册账号
3. 验证邮箱和手机号
4. 完成账号设置

### 免费额度：
- ✅ **100 封/天**（约 3000 封/月）
- ✅ 永久免费
- ✅ 无需信用卡

---

## 2️⃣ 创建 API Key

### 步骤：
1. 登录 SendGrid 后台
2. 左侧菜单：**Settings** → **API Keys**
3. 点击 **Create API Key**
4. 填写信息：
   - **Name**: `LumeClaw Email`
   - **Permissions**: `Full Access` 或 `Restricted Access`（只选 Mail Send）
5. 点击 **Create & View**
6. **复制 API Key**（只显示一次，保存好！）

格式类似：`SG.xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

## 3️⃣ 配置发件人邮箱

### 方式 A：单发件人验证（推荐新手）
1. SendGrid 后台：**Settings** → **Sender Authentication**
2. 点击 **Create a Sender**
3. 填写信息：
   - **From Email**: `noreply@lumeword.cn`（或你的域名邮箱）
   - **From Name**: `LumeClaw`
   - **Reply-To**: 你的联系邮箱
4. 验证邮箱（会发验证邮件）

### 方式 B：域名验证（推荐生产环境）
1. SendGrid 后台：**Settings** → **Sender Authentication**
2. 点击 **Authenticate Your Domain**
3. 按提示添加 DNS 记录（CNAME）
4. 验证通过后可以使用任意该域名的邮箱

---

## 4️⃣ 配置服务器环境变量

### SSH 登录服务器：
```bash
ssh root@120.55.192.144
```

### 编辑 .env 文件：
```bash
cd /home/admin/.openclaw/workspace/lingxi-cloud/backend
vim .env
```

### 添加配置：
```bash
# 邮箱配置
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=noreply@lumeword.cn
```

### 保存并退出：
- Vim: 按 `ESC`，输入 `:wq`，回车

---

## 5️⃣ 重启后端服务

```bash
cd /home/admin/.openclaw/workspace/lingxi-cloud/backend
pm2 restart lingxi-cloud --update-env
```

### 检查日志：
```bash
pm2 logs lingxi-cloud --lines 50
```

---

## 6️⃣ 测试邮箱功能

### 访问前端：
http://120.55.192.144:3000

### 测试步骤：
1. 点击 **注册**
2. 填写邀请码
3. 填写昵称（至少 2 字符）
4. 填写密码（至少 6 位）
5. **填写邮箱（必填）**
6. 点击 **发送验证码**
7. 检查邮箱收到 6 位验证码
8. **填写验证码（必填）**
9. 点击 **注册**

### 测试登录：
1. 点击 **登录**
2. 输入**邮箱或昵称** + 密码
3. 登录成功

---

## 🎯 完成！

现在用户注册必须：
- ✅ 提供有效邮箱
- ✅ 完成邮箱验证
- ✅ 防止垃圾账号

登录支持：
- ✅ 邮箱 + 密码
- ✅ 昵称 + 密码

---

## 📊 监控用量

### SendGrid 后台查看：
1. **Email API** → **Statistics**
2. 查看发送量、打开率、点击率等

### 免费额度提醒：
- 100 封/天 = 约 4 封/小时
- 如果超限，SendGrid 会暂停发送直到次日

---

## 🔧 故障排查

### 问题 1：发送失败
```
错误：SendGrid API Key 未配置
```
**解决**：检查 `.env` 文件中 `SENDGRID_API_KEY` 是否正确

### 问题 2：邮件进入垃圾箱
**解决**：
1. 使用域名验证（不是单发件人）
2. 添加 SPF/DKIM 记录
3. 避免频繁发送相同内容

### 问题 3：收不到验证码
**解决**：
1. 检查垃圾邮件文件夹
2. 确认邮箱地址正确
3. 查看 SendGrid 后台 Activity 是否有发送记录

---

## 💡 进阶建议

### 1. 使用自定义域名
- 提升品牌信任度
- 减少进入垃圾箱的概率

### 2. 设置邮件模板
- 在 SendGrid 后台创建品牌化模板
- 添加 Logo、品牌色等

### 3. 监控送达率
- 定期检查 SendGrid Statistics
- 关注 bounce rate 和 spam reports

---

## 📋 API 变更总结

### 注册 API (`POST /api/auth/register`)
**请求参数：**
```json
{
  "inviteCode": "LINGXI-XXXX",  // 必填
  "nickname": "用户昵称",        // 必填，≥2 字符
  "password": "密码",            // 必填，≥6 位
  "email": "user@example.com",  // 必填，有效邮箱
  "code": "123456"              // 必填，6 位验证码
}
```

### 登录 API (`POST /api/auth/login`)
**请求参数：**
```json
{
  "email": "user@example.com",  // 邮箱或昵称（二选一）
  "nickname": "用户昵称",        // 邮箱或昵称（二选一）
  "password": "密码"             // 必填
}
```

### 发送验证码 API (`POST /api/auth/send-code`)
**请求参数：**
```json
{
  "email": "user@example.com",  // 必填
  "type": "register"             // 必填：register|login|reset
}
```

### 验证验证码 API (`POST /api/auth/verify-code`)
**请求参数：**
```json
{
  "email": "user@example.com",  // 必填
  "code": "123456"               // 必填，6 位数字
}
```

---

_配置完成后，记得测试注册和登录流程确保一切正常！_
