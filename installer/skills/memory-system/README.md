# 统一记忆系统 - Universal Memory System

完全兼容Supermemory，支持本地存储和云端同步的记忆系统。

## ✨ 特性

- ✅ **兼容Supermemory** - 无需迁移，无缝使用
- ✅ **本地存储** - 快速访问，离线可用
- ✅ **自动同步** - 云端+本地双重保障
- ✅ **领域隔离** - 按coding/business/creative/product分类
- ✅ **智能搜索** - 多适配器并行搜索，合并结果
- ✅ **缓存优化** - 热点数据毫秒级响应

## 📦 安装

```bash
# 已自动创建在：
~/.openclaw/workspace/skills/memory-system/
```

## 🚀 快速开始

### 基础使用

```javascript
import { MemoryManager } from './skills/memory-system/manager.mjs';

// 初始化
const memory = new MemoryManager({
  primary: 'supermemory',  // 主服务
  
  local: {
    enabled: true,
    basePath: '~/.openclaw/memory'
  },
  
  supermemory: {
    enabled: true,
    apiKey: process.env.SUPERMEMORY_API_KEY,
    userId: 'default'
  },
  
  syncStrategy: 'auto'  // 自动同步
});

// 添加记忆
await memory.add('用户喜欢用React开发', {
  domain: 'coding',
  type: 'preference',
  importance: 8
});

// 搜索记忆
const results = await memory.search('React', {
  domain: 'coding',
  limit: 10
});

// 按领域获取
const codingMemories = await memory.getByDomain('coding');

// 获取统计
const stats = await memory.getStats();
console.log(stats);
```

## 📊 领域划分

```javascript
// 领域
domains: {
  coding: '代码相关知识',
  business: '运营相关知识',
  creative: '创意相关知识',
  product: '产品相关知识',
  personal: '个人偏好设置'
}
```

## 🔧 配置

### 完整配置示例

```json
{
  "primary": "supermemory",
  
  "local": {
    "enabled": true,
    "basePath": "~/.openclaw/memory"
  },
  
  "supermemory": {
    "enabled": true,
    "apiKey": "${SUPERMEMORY_API_KEY}",
    "userId": "default"
  },
  
  "syncStrategy": "auto",
  "cacheEnabled": true
}
```

### 只用Supermemory

```javascript
const memory = new MemoryManager({
  primary: 'supermemory',
  local: { enabled: false }
});
```

### 只用本地存储

```javascript
const memory = new MemoryManager({
  primary: 'local',
  supermemory: { enabled: false }
});
```

## 💡 使用场景

### 灵犀切换思维模式时

```javascript
// 切换到云溪思维
async function switchToCoderMode() {
  // 加载coding领域记忆
  const codingMemories = await memory.getByDomain('coding');
  
  // 注入到上下文
  context.memories = codingMemories;
  
  // 现在灵犀知道用户的代码风格、技术偏好等
}

// 切换到若曦思维
async function switchToOpsMode() {
  // 加载business领域记忆
  const businessMemories = await memory.getByDomain('business');
  
  // 注入到上下文
  context.memories = businessMemories;
}
```

### 从反馈中学习

```javascript
// 用户给出反馈
async function handleFeedback(feedback: string, taskId: string) {
  // 记住这次反馈
  await memory.add(feedback, {
    domain: 'personal',
    type: 'feedback',
    importance: 9,
    relatedTask: taskId
  });
  
  // 下次任务时，会搜索到这个反馈
  // 从而改进行为
}
```

### 记住用户偏好

```javascript
// 用户表达偏好
await memory.add('用户喜欢简洁的回答', {
  domain: 'personal',
  type: 'preference',
  importance: 8
});

// 以后每次回答前
const preferences = await memory.search('preference', {
  domain: 'personal'
});

// 根据偏好调整回答风格
if (preferences.some(p => p.content.includes('简洁'))) {
  // 使用简洁风格
}
```

## 🔄 同步机制

### 自动同步（推荐）

```javascript
const memory = new MemoryManager({
  syncStrategy: 'auto'
});

// 添加记忆时自动同步到所有适配器
await memory.add('内容', { domain: 'coding' });
// → 同时保存到Supermemory和本地
```

### 手动同步

```javascript
const memory = new MemoryManager({
  syncStrategy: 'manual'
});

// 需要时手动同步
await memory.sync();
```

## 📈 性能优化

### 缓存

```javascript
// 默认开启缓存
const memory = new MemoryManager({
  cacheEnabled: true
});

// 第一次搜索（从磁盘/云端加载）
const results1 = await memory.search('React');

// 第二次搜索（从缓存加载，毫秒级）
const results2 = await memory.search('React');

// 清除缓存
memory.clearCache();
```

### 本地优先策略

```javascript
// 按领域获取时，优先从本地加载
const codingMemories = await memory.getByDomain('coding');

// 流程：
// 1. 先查本地（快）
// 2. 本地没有才查云端
// 3. 云端结果同步到本地（下次更快）
```

## 🔍 API 参考

### add(content, metadata?)

添加记忆到所有适配器

```javascript
await memory.add('内容', {
  domain: 'coding',
  type: 'preference',
  importance: 8,
  tags: ['react', 'frontend']
});
```

### search(query, options?)

智能搜索所有适配器

```javascript
const results = await memory.search('React', {
  domain: 'coding',
  type: 'preference',
  tags: ['frontend'],
  limit: 10,
  minImportance: 5
});
```

### getByDomain(domain)

按领域获取记忆（本地优先）

```javascript
const memories = await memory.getByDomain('coding');
```

### getStats()

获取统计信息

```javascript
const stats = await memory.getStats();
// {
//   total: 100,
//   byDomain: { coding: 30, business: 40, ... },
//   byType: { preference: 20, learning: 30, ... }
// }
```

## 🗂️ 文件结构

### 本地存储

```
~/.openclaw/memory/
├── domains/
│   ├── coding.json       # 代码领域记忆
│   ├── business.json     # 运营领域记忆
│   ├── creative.json     # 创意领域记忆
│   ├── product.json      # 产品领域记忆
│   ├── personal.json     # 个人偏好记忆
│   └── general.json      # 通用记忆
```

### 文件格式

```json
{
  "items": [
    {
      "id": "local_1234567890_abc123",
      "content": "用户喜欢用React开发",
      "metadata": {
        "domain": "coding",
        "type": "preference",
        "importance": 8,
        "createdAt": "2026-02-15T14:00:00.000Z",
        "tags": ["react", "frontend"]
      }
    }
  ]
}
```

## 🌟 兼容性

### 与Supermemory完全兼容

```javascript
// 之前用Supermemory
import Supermemory from 'supermemory';
const client = new Supermemory({ apiKey: '...' });
await client.add({ content: '...' });

// 现在用统一接口（同样的效果）
const memory = new MemoryManager({ ... });
await memory.add('...');
// → 自动保存到Supermemory和本地
```

### 渐进式迁移

```javascript
// 可以继续用Supermemory的API
// 也可以用新的统一API
// 两者可以共存
```

## 🎯 最佳实践

1. **领域隔离** - 不同领域的记忆分开存储
2. **重要性标记** - 给记忆标记importance，搜索时优先返回
3. **类型分类** - 用type区分preference/learning/feedback/decision
4. **定期统计** - 查看getStats()了解记忆分布
5. **自动同步** - 推荐使用auto同步策略

---

*最后更新：2026-02-15*
