# API 响应格式规范

## 统一格式

### 成功响应
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功" // 可选
}
```

### 错误响应
```json
{
  "success": false,
  "error": "错误消息"
}
```

## 使用方法

### 1. 导入工具
```javascript
import { success, errors } from '../utils/response.js';
```

### 2. 成功响应
```javascript
// 基本用法
success(res, { users: [] });

// 带消息
success(res, { users: [] }, '获取成功');
```

### 3. 错误响应
```javascript
// 400 Bad Request
errors.badRequest(res, '参数错误');

// 401 Unauthorized
errors.unauthorized(res);

// 403 Forbidden
errors.forbidden(res);

// 404 Not Found
errors.notFound(res, '用户');

// 500 Server Error
errors.serverError(res, error.message);
```

## 迁移示例

### ❌ 旧代码
```javascript
// 成功
res.json({ success: true, users });

// 错误
res.status(404).json({ error: '用户不存在' });
```

### ✅ 新代码
```javascript
// 成功
success(res, { users });

// 错误
errors.notFound(res, '用户');
```

## HTTP 状态码

| 状态码 | 方法 | 使用场景 |
|-------|------|---------|
| 200 | success | 成功 |
| 400 | badRequest | 参数错误 |
| 401 | unauthorized | 未登录 |
| 403 | forbidden | 无权限 |
| 404 | notFound | 资源不存在 |
| 500 | serverError | 服务器错误 |

---

_创建时间: 2026-02-27_
