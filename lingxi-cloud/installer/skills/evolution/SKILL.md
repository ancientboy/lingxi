# 进化模块 (Evolution)

> 🧬 让 Agent 能够自主学习、共享经验、持续进化

## 概述

进化模块实现了灵犀云的基因系统。基因（Gene）是一种可复用的经验单元，记录了解决特定类型问题的策略和方法。

## 功能

| 功能 | 说明 |
|------|------|
| 基因存储 | 本地存储和管理基因 |
| 基因同步 | 从平台同步优质基因 |
| 基因上报 | 将优质经验上报到平台 |
| 基因注入 | 将基因注入到 Agent 的 System Prompt |

## 文件结构

```
skills/evolution/
├── SKILL.md          # 本文档
├── types.d.ts        # TypeScript 类型定义
├── storage.mjs       # 基因存储模块
├── recorder.mjs      # 基因记录模块（Phase 2）
├── injector.mjs      # 基因注入模块（Phase 2）
├── evaluator.mjs     # 基因评估模块（Phase 2）
├── task-wrapper.mjs  # 任务包装模块（推荐使用）
├── uploader.mjs      # 基因上报模块（Phase 4）
├── downloader.mjs    # 基因同步模块（Phase 4）
└── index.mjs         # 入口模块

genes/
├── index.json      # 基因索引
├── platform/       # 平台基因（从平台同步）
│   ├── debug/
│   ├── coding/
│   ├── planning/
│   └── ...
├── shared/         # 团队共享基因（team scope）
│   └── ...
└── local/          # 本地基因（用户私有）
    └── ...
```

## 使用方法

### 评估模块 (evaluator.mjs)

评估解决方案是否值得记录为基因：

```javascript
import { evaluateGene } from './skills/evolution/evaluator.mjs';

const result = evaluateGene(task, solution);
// 返回：{ score: 0-5, reasons: string[], details: {...} }

// 评分规则：
// - 成功解决问题 +2
// - 方法可复用 +1
// - 通用性强 +1
// - 用户认可 +1
// - 复杂度适中 +0.5
// - 常见模式 -1
```

### 记录模块 (recorder.mjs)

任务完成后自动记录基因：

```javascript
import { recordIfWorthy } from './skills/evolution/recorder.mjs';

// 任务完成时调用
const result = await recordIfWorthy(task, solution, context);
// 返回：{ gene: Gene|null, evaluation: {...}, message: string }

// 手动记录基因
const gene = await recordManual({
  name: '我的策略',
  category: 'debug',
  trigger: '遇到特定问题时',
  description: '策略描述',
  steps: ['步骤1', '步骤2'],
  tips: ['提示1']
}, context);
```

### 注入模块 (injector.mjs)

将基因注入到 Agent 的 System Prompt：

```javascript
import { 
  buildGenePrompt, 
  findRelevantGenes,
  getGeneStats 
} from './skills/evolution/injector.mjs';

// 构建完整的基因 Prompt
const genePrompt = await buildGenePrompt('coder', {
  maxGenes: 10,
  minScore: 3
});

// 运行时检索相关基因
const relevantGenes = await findRelevantGenes(
  '调试 Node.js 内存泄漏',
  'coder',
  { maxResults: 3 }
);

// 获取基因统计
const stats = await getGeneStats();
```

### 任务包装模块 (task-wrapper.mjs)

**推荐使用方式** - 在任务完成后自动评估并记录基因：

```javascript
import { wrapTaskResult, wrapSimpleTask, createTaskWrapper } from './skills/evolution/task-wrapper.mjs';

// 方式1：完整参数
const result = await wrapTaskResult(
  { title: '任务标题', description: '任务描述' },
  { success: true, summary: '解决摘要', steps: ['步骤1', '步骤2'], tools: ['read', 'edit'] },
  { agentId: 'coder', userId: 'user-123' }
);
// 返回：{ solution, gene, evaluation, message }

// 方式2：简化调用
const result = await wrapSimpleTask(
  '修复登录 Bug',
  '用户登录时出现 500 错误',
  { success: true, summary: '修复了数据库连接问题', steps: ['检查日志', '增加连接池'] },
  { agentId: 'coder' }
);

// 方式3：创建可复用包装器（推荐 Agent 使用）
const wrapForCoder = createTaskWrapper({ agentId: 'coder' });

// 在任务完成后调用
const wrappedResult = await wrapForCoder(task, solution);
```

**特点：**
- 静默执行，不影响主流程
- 自动评估基因价值（评分 ≥3 才记录）
- 返回原始解决方案，方便链式调用

### 入口模块 (index.mjs)

统一导出所有公共函数：

```javascript
import evo from './skills/evolution/index.mjs';

// 记录基因
await evo.recordIfWorthy(task, solution, context);

// 构建 Prompt
const prompt = await evo.buildGenePrompt('coder');

// 心跳同步（Phase 4）
const result = await evo.runHeartbeatSync();

// 检查状态
const status = await evo.getStatus();
```

### 存储模块 (storage.mjs)

```javascript
import {
  saveGene,
  loadGene,
  listGenes,
  markForUpload,
  getPendingGenes
} from './skills/evolution/storage.mjs';

// 保存基因
await saveGene(gene, 'local', 'private');  // type: 'platform' | 'local', scope: 'private' | 'team' | 'platform'

// 加载基因
const gene = await loadGene('gene-debug-log-first');

// 列出所有基因
const genes = await listGenes({ category: 'debug' });

// 按 agentId 过滤（包含 shared + local + platform）
const myGenes = await listGenes({ agentId: 'agent-123' });

// 标记为待上传
await markForUpload('gene-my-workflow');
```

### 基因格式

```typescript
interface Gene {
  id: string;              // 唯一标识 "gene-{category}-{name}"
  version: string;         // 版本号 "1.0.0"
  name: string;            // 简短名称
  category: GeneCategory;  // debug | coding | writing | analysis | planning | tool
  trigger: string;         // 触发条件描述
  strategy: {
    description: string;   // 一句话描述策略
    steps: string[];       // 具体步骤
    tips?: string[];       // 注意事项
  };
  capsules?: Record<string, Capsule>;  // 环境适配（可选）
  metadata?: {
    author: 'platform' | 'user';
    scope?: GeneScope;     // private | team | platform
    agent_id?: string;     // 创建该基因的 Agent ID
    roles?: string[];      // 适用的 agent 角色
    tags?: string[];
    score?: number;        // 评分 0-5
    usage_count?: number;
    created_at: string;
    updated_at: string;
  };
}
```

### 种子基因

模块包含 3 个种子基因：

| ID | 名称 | 分类 | 说明 |
|----|------|------|------|
| gene-debug-log-first | 先看日志再改代码 | debug | 调试时的最佳实践 |
| gene-write-outline | 先写大纲再展开 | coding | 编码和写作的结构化方法 |
| gene-task-breakdown | 任务拆解 | planning | 复杂任务的分解策略 |

## API 参考

### 评估函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `evaluateGene(task, solution)` | Object, Object | `{score, reasons}` | 评估基因价值（0-5分） |
| `extractName(solution)` | Object | string | 从解决方案提取基因名称 |
| `extractSteps(solution)` | Object | string[] | 提取步骤列表 |
| `inferCategory(task)` | Object | GeneCategory | 推断基因分类 |
| `summarize(solution)` | Object | string | 生成策略摘要 |

### 记录函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `recordIfWorthy(task, solution, context)` | Object, Object, Object | Promise\<Result\> | 评估并记录基因 |
| `recordManual(geneData, context)` | Object, Object | Promise\<Gene\> | 手动记录基因（跳过评估） |

### 注入函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `buildGenePrompt(agentId, options)` | string, Object | Promise\<string\> | 构建基因部分的 System Prompt |
| `findRelevantGenes(task, agentId, options)` | string, string, Object | Promise\<Gene[]\> | 运行时检索相关基因 |
| `getGenesByCategory(category, options)` | string, Object | Promise\<Gene[]\> | 获取特定分类的基因 |
| `getGeneStats()` | - | Promise\<Object\> | 获取基因统计信息 |
| `buildCompactGenePrompt(agentId, options)` | string, Object | Promise\<string\> | 构建简洁的基因提示 |

### 入口函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `runHeartbeatSync(config)` | EvolutionConfig | Promise\<Object\> | 心跳同步（已实现） |
| `syncPlatformGenes(config)` | EvolutionConfig | Promise\<Object\> | 同步平台基因（已实现） |
| `uploadPendingGenes(config)` | EvolutionConfig | Promise\<Object\> | 上报待上传基因（已实现） |
| `getStatus()` | - | Promise\<Object\> | 检查模块状态 |

### 任务包装函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `wrapTaskResult(task, solution, context)` | Object, Object, Object | Promise\<Object\> | 包装任务结果，自动记录基因 |
| `wrapSimpleTask(title, desc, result, context)` | string, string, Object, Object | Promise\<Object\> | 简化的任务包装 |
| `createTaskWrapper(defaultContext)` | Object | Function | 创建可复用的包装器 |

### 同步配置

```typescript
interface EvolutionConfig {
  platformApiUrl: string;  // 平台 API 地址
  userToken: string;       // 用户 Token
  instanceId: string;      // 实例 ID
  userId: string;          // 用户 ID
  uploadEnabled: boolean;  // 是否启用上报
  syncInterval: number;    // 同步间隔（毫秒）
}
```

### 存储函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `saveGene(gene, type, scope)` | Gene, 'platform'\|'local', 'private'\|'team'\|'platform' | Promise\<void\> | 保存基因 |
| `loadGene(geneId)` | string | Promise\<Gene\|null\> | 加载基因 |
| `listGenes(filter)` | {type?, category?, agentId?} | Promise\<Gene[]\> | 列出基因（支持 agentId 过滤） |
| `deleteLocalGene(geneId)` | string | Promise\<void\> | 删除本地/共享基因 |
| `markForUpload(geneId)` | string | Promise\<void\> | 标记待上传 |
| `getPendingGenes()` | - | Promise\<Gene[]\> | 获取待上传基因 |
| `markAsUploaded(geneIds)` | string[] | Promise\<void\> | 标记已上传 |
| `getLastSyncTime()` | - | Promise\<number\> | 获取上次同步时间 |
| `setLastSyncTime(ts)` | number | Promise\<void\> | 设置同步时间 |
| `isUploadEnabled()` | - | Promise\<boolean\> | 是否启用上报 |

## 集成方式

### 心跳同步

在 `HEARTBEAT.md` 中添加：

```javascript
import('./skills/evolution/index.mjs').then(async (evo) => {
  const result = await evo.runHeartbeatSync();
  console.log(`基因同步：同步 ${result.synced} 个，上报 ${result.uploaded} 个`);
});
```

### Prompt 注入

在构建 Agent System Prompt 时：

```javascript
import { buildGenePrompt } from './skills/evolution/injector.mjs';

const genePrompt = await buildGenePrompt('coder');
const fullPrompt = `${basePrompt}\n${genePrompt}`;
```

## 配置

基因配置存储在 `genes/index.json`：

```json
{
  "version": "1.0.0",
  "last_sync": 1708550400000,
  "upload_enabled": true,
  "genes": {
    "platform": ["gene-debug-log-first"],
    "local": []
  }
}
```

## 隐私说明

- 本地基因 (`genes/local/`) 不会自动上传
- 只有标记为待上传的基因才会被上报
- 用户可以通过 `setUploadEnabled(false)` 关闭上报功能

## 开发阶段

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 基因格式 + 本地存储 | ✅ 完成 |
| Phase 2 | 基因记录 + 注入 | ✅ 完成 |
| Phase 3 | 平台 API | 📋 待开始 |
| Phase 4 | 上报 + 同步 | 📋 待开始 |

---

## 模块依赖关系

```
index.mjs (入口)
├── recorder.mjs (记录)
│   ├── evaluator.mjs (评估)
│   └── storage.mjs (存储)
├── injector.mjs (注入)
│   └── storage.mjs (存储)
├── task-wrapper.mjs (任务包装)
│   └── recorder.mjs (记录)
└── storage.mjs (存储)
```

---

*模块版本：1.1.0*
*最后更新：2026-02-22*
