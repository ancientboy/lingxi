# 临时邮箱技能

为 Agent 提供自动化的临时邮箱功能，用于注册账号、接收验证码等。

## 功能

- 创建临时邮箱
- 获取邮件列表
- 提取验证码/链接
- 等待新邮件

## 使用

```javascript
import tempmail from './skills/tempmail/index.mjs';

// 创建新邮箱
const email = await tempmail.create();
console.log(email.address); // xxx@domain.com

// 等待验证码
const code = await tempmail.waitForCode('verification');
console.log(code); // 123456

// 获取所有邮件
const messages = await tempmail.getMessages();
```

## API

使用 Temp-Mail.io API，无需注册。

## 限制

- 邮箱有效期：约 1 小时
- 不能发邮件，只能收
