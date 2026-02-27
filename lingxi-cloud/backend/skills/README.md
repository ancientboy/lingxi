# 技能库优化

## 📋 功能概述

本模块实现了以下功能：

1. **技能评分标准**
   - GitHub Stars > 50
   - 最近30天有更新（初步判断）
   - Documentation 完整（初步判断）
   - 不是测试/原型类项目（排除 test/prototype/demo 标签）

2. **定期更新机制**
   - 使用 node-cron 实现定时任务
   - 每周日中午12点自动同步
   - 可手动触发同步

3. **技能库管理**
   - 从 ClawHub 抓取优质技能
   - 过滤并添加到 library.json
   - 保持现有的技能不重复

## 📁 文件结构

```
skills/
├── library.json              # 技能库文件
├── clawhub-integration.mjs   # ClawHub 集成模块
├── sync-cron.mjs             # 定时任务模块
├── sync-job.mjs              # 同步任务模块
└── README.md                 # 本文件
```

## 🚀 使用方法

### 安装依赖

```bash
cd backend
npm install
```

### 手动同步技能

```bash
cd backend
node -e "
import('./skills/sync-cron.mjs').then(m => {
  m.manualSync().then(r => console.log(r));
});
"
```

### 启动定时任务

定时任务在后端服务启动时自动运行（每周日中午12点）。

#### 自定义 cron 表达式

修改 `backend/index.js` 中的配置：

```javascript
import { startCronJob } from './skills/sync-cron.mjs';

// 每天中午12点同步
startCronJob('0 0 * * *');

// 每小时同步
startCronJob('0 * * * *');

// 每周日中午12点同步（默认）
startCronJob('0 0 * * 0');
```

### 检查同步状态

```bash
cd backend
node -e "
import('./skills/sync-cron.mjs').then(m => {
  m.checkSyncStatus().then(r => console.log(r));
});
"
```

### 手动停止定时任务

```javascript
import cron from 'node-cron';
import { stopCronJob } from './skills/sync-cron.mjs';

const task = cron.schedule('0 0 * * 0', () => {
  console.log('同步任务执行...');
});

// 启动定时任务
task.start();

// 停止定时任务
stopCronJob(task);
```

## 📊 技能评分标准

### 评分细则

| 条件 | 权重 | 说明 |
|------|------|------|
| GitHub Stars > 50 | ⭐⭐⭐⭐⭐ | 社区认可度 |
| 最近30天更新 | ⭐⭐⭐⭐ | 活跃度 |
| Documentation 完整 | ⭐⭐⭐⭐ | 文档质量 |
| 非测试项目 | ⭐⭐⭐ | 项目类型 |

### 过滤规则

- **必须满足至少3个条件**才能被添加到技能库
- **自动排除**以下类型的项目：
  - test/tests (测试类)
  - prototype (原型类)
  - demo (演示类)

## 🔧 技能库结构

### library.json 格式

```json
{
  "version": "1.1.0",
  "name": "灵犀云技能库",
  "description": "灵犀云官方技能库 - 包含精选技能",
  "lastUpdated": "2025-02-27T13:57:00.000Z",
  "skills": [
    {
      "id": "code-reviewer",
      "name": "代码审查",
      "desc": "专业的代码审查助手...",
      "agent": "coder",
      "tags": ["代码", "审查", "优化"],
      "version": "1.0.0",
      "author": "灵犀云官方",
      "displayOrder": 1
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 技能唯一标识 |
| name | string | ✅ | 技能名称 |
| desc | string | ✅ | 技能描述 |
| agent | string | ✅ | 关联的 Agent |
| tags | array | ✅ | 标签列表 |
| version | string | ✅ | 版本号 |
| author | string | ✅ | 作者 |
| displayOrder | number | ✅ | 显示顺序 |

## 🌐 ClawHub API

当前支持的 API 端点：

- `GET /api/skills/all` - 所有技能
- `GET /api/skills/popular` - 热门技能
- `GET /api/skills/list` - 技能列表

如果 ClawHub API 不可用，系统将使用本地缓存数据。

## 🐛 故障排除

### 1. 抓取 ClawHub 失败

**可能原因：**
- 网络连接问题
- ClawHub 服务不可用
- API 端点变更

**解决方案：**
- 检查网络连接
- 查看 ClawHub 服务状态
- 更新 API 端点配置

### 2. 定时任务不执行

**可能原因：**
- cron 表达式配置错误
- 服务未正常启动

**解决方案：**
- 检查 cron 表达式格式
- 查看服务日志
- 手动触发同步测试

### 3. 技能未被添加

**可能原因：**
- 技能不满足评分标准
- 技能已存在于 library.json

**解决方案：**
- 检查技能的评分结果
- 查看当前技能库内容

## 📝 开发指南

### 添加新功能

1. 修改 `clawhub-integration.mjs` 或 `sync-cron.mjs`
2. 更新测试用例
3. 验证功能

### 测试方法

```bash
cd backend
node -e "
import('./skills/sync-cron.mjs').then(m => {
  m.syncSkills().then(r => console.log(JSON.stringify(r, null, 2)));
});
"
```

### 贡献指南

1. Fork 项目
2. 创建特性分支
3. 提交代码
4. 发起 Pull Request

## 📄 许可证

MIT License
