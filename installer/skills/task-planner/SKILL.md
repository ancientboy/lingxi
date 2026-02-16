# 智能任务拆解规划器

将大目标自动拆解成可执行的小任务，智能安排到日程中。

## 核心功能

✨ **智能拆解**
- 输入大目标（如"学习 AI"、"健身计划"）
- AI 自动拆解成可执行的小任务
- 每个任务有时长估算和优先级

📊 **进度追踪**
- 追踪学习计划的进度
- 可视化完成情况
- 激励机制

📅 **智能安排**
- 根据你的可用时间安排
- 避免时间冲突
- 支持优先级排序

🎯 **和 tasks 技能结合**
- 拆解后的任务自动同步到 tasks
- 支持微信提醒
- Heartbeat 检查

## 使用方式

### 方式 1：自然语言（推荐）

```
你: 我想学习 AI，帮我规划下
灵犀: 收到！让若曦来帮你规划学习计划~
若曦: 好的！我来帮你拆解 AI 学习计划...

[若曦分析并拆解]

若曦: 我把 AI 学习拆成了 4 个阶段：

**阶段 1: 基础准备（预计 2 周）**
1. 数学基础复习（线性代数、概率论）- 10 小时
2. Python 编程基础 - 5 小时
3. 数据处理入门 - 3 小时

**阶段 2: 机器学习入门（预计 3 周）**
1. 经典算法学习（线性回归、决策树）- 15 小时
2. 实践项目：房价预测 - 5 小时
3. 算法进阶（SVM、随机森林）- 10 小时

**阶段 3: 深度学习（预计 4 周）**
...

**阶段 4: 实战项目（预计 3 周）**
...

要我把这些安排到你的日程中吗？
```

### 方式 2：通过技能调用

```javascript
import planner from './skills/task-planner/index.mjs';

// 创建学习计划
const plan = await planner.createPlan('学习 AI', {
  deadline: '2026-06-01',
  hoursPerWeek: 10,
  tags: ['学习']
});

// 查看计划
planner.showPlan(plan.id);

// 同步到 tasks 技能
await planner.syncToTasks(plan.id);

// 追踪进度
planner.trackProgress(plan.id);
```

## 工作流程

### 1. 创建计划

```
用户: 我想学习 AI
   ↓
若曦分析目标
   ↓
拆解成多个阶段
   ↓
每个阶段拆解成小任务
   ↓
估算时长和优先级
```

### 2. 智能安排

```
用户提供可用时间（如每周 10 小时）
   ↓
系统根据优先级排序
   ↓
安排到具体日期和时间
   ↓
同步到 tasks 技能
```

### 3. 进度追踪

```
完成任务 → 标记完成
   ↓
更新进度条
   ↓
计算预计完成时间
   ↓
如果落后 → 调整计划
```

## 计划模板

### 学习计划模板

```json
{
  "goal": "学习 AI",
  "deadline": "2026-06-01",
  "totalHours": 120,
  "stages": [
    {
      "name": "基础准备",
      "duration": "2 weeks",
      "tasks": [
        { "title": "数学基础", "hours": 10, "priority": "high" },
        { "title": "Python 基础", "hours": 5, "priority": "medium" }
      ]
    }
  ]
}
```

### 健身计划模板

```json
{
  "goal": "健身增肌",
  "duration": "12 weeks",
  "stages": [
    {
      "name": "适应期",
      "duration": "2 weeks",
      "tasks": [
        { "title": "有氧训练", "frequency": "每周 3 次" },
        { "title": "力量训练入门", "frequency": "每周 2 次" }
      ]
    }
  ]
}
```

## API

| 方法 | 说明 |
|------|------|
| createPlan(goal, options) | 创建计划 |
| showPlan(planId) | 查看计划 |
| syncToTasks(planId) | 同步到 tasks |
| trackProgress(planId) | 追踪进度 |
| adjustPlan(planId) | 调整计划 |
| completeTask(planId, taskId) | 完成任务 |

## 配置

```javascript
{
  "defaultHoursPerWeek": 10,  // 默认每周学习时长
  "reminder": true,           // 开启提醒
  "autoAdjust": true          // 自动调整计划
}
```

## 和其他技能结合

- **tasks 技能** - 任务管理和提醒
- **calendar 技能** - 日程管理（如果有）
- **memory 技能** - 记住学习进度

## 提示

✅ **DO：**
- 把大目标拆成小任务
- 设定合理的截止日期
- 定期检查进度

❌ **DON'T：**
- 不要一次安排太多
- 不要忽略休息时间
- 不要忘记调整计划
