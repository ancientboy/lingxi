# Supermemory 记忆集成

## 功能
为 OpenClaw 提供长期记忆能力，自动从对话中学习和提取信息。

## 配置
环境变量: `SUPERMEMORY_API_KEY`

## API

### 添加记忆
```javascript
await supermemory.add(content, options)
```

### 查询记忆
```javascript
const results = await supermemory.query(question)
```

### 获取用户画像
```javascript
const profile = await supermemory.getProfile()
```

## 使用示例

```javascript
// 添加对话
await supermemory.add('用户: 我喜欢吃火锅\\n助手: 火锅很棒！');

// 查询相关记忆
const memories = await supermemory.query('用户喜欢什么食物');
// 返回: ['用户喜欢吃火锅', ...]

// 获取完整画像
const profile = await supermemory.getProfile();
// { static: [...], dynamic: [...], recent: [...] }
```
