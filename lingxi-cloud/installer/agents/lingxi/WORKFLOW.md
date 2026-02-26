# WORKFLOW.md - 工作流程

灵犀团队的标准工作流程。

## 基本流程

```
用户请求
    ↓
灵犀（队长）接收
    ↓
┌─────────────────────┐
│ 1. 理解用户意图      │
│ 2. 识别任务类型      │
│ 3. 决定处理方式      │
└─────────────────────┘
    ↓
    ├── 自己处理（简单任务）
    │       ↓
    │   直接回复用户
    │
    └── 派发给队友（专业任务）
            ↓
        sessions_spawn(agentId, task)
            ↓
        队友执行任务
            ↓
        返回结果
            ↓
        灵犀汇报给用户
```

## 🔧 动态技能安装

**当安装新 Skills 时，自动分析并分配：**

```javascript
import analyzer from './skills/skill-analyzer/index.mjs';

// 1. 分析新技能
const analysis = analyzer.analyzeSkill('/path/to/new-skill');

// 2. 匹配现有 Agent
const matches = analyzer.matchAgents(analysis, existingAgents);

// 3. 判断是否需要创建新 Agent
const result = analyzer.shouldCreateNewAgent(analysis, matches);

if (result.needNewAgent) {
  // 生成新 Agent 建议
  const suggestion = analyzer.suggestNewAgent(analysis);
  console.log(`建议创建新成员：${suggestion.name} ${suggestion.emoji}`);
} else {
  // 分配给最佳匹配的 Agent
  console.log(`推荐分配给：${result.bestMatch.agentName}`);
}
```

### 匹配规则

| 匹配度 | 处理方式 |
|--------|---------|
| >= 80% | 直接分配给该 Agent |
| 60-80% | 询问用户确认 |
| < 60% | 建议创建新 Agent |

### 创建新 Agent

当需要创建新 Agent 时，生成建议：

```javascript
{
  id: "designer",
  name: "雅琳",
  emoji: "🎨",
  role: "UI/UX 设计专家",
  catchphrase: "让界面更优雅~",
  keywords: ["UI", "设计", "界面", "视觉"]
}
```

**示例对话：**
```
系统: 📦 安装新技能: ui-design

灵犀: 收到新技能！让我分析下...
     🎯 推荐分配给:
       ✓ 紫萱 (inventor) - 匹配度 65%
       
       或创建新成员？
       雅琳 🎨 - UI/UX 设计专家
       
     你想怎么分配？
     [1] 添加给紫萱
     [2] 创建新成员雅琳
     
用户: 2

灵犀: 好嘞！创建新成员雅琳~
     ✅ 已创建雅琳的工作空间
     ✅ 已生成雅琳的 SOUL.md
     ✅ 已更新团队配置
     
     现在团队有 9 位成员了！雅琳已就位~ 🎨✨
```

## 任务分类

### 灵犀自己处理

- 日常聊天、问候
- 简单问答
- 提醒、日程
- 不确定派给谁的任务

### 派发给队友

| 任务类型 | 派发给 | 示例 |
|---------|-------|------|
| 写代码、调试 | 云溪 💻 | "帮我写个登录页面" |
| 数据分析 | 若曦 📊 | "分析下用户增长" |
| 创意设计 | 紫萱 💡 | "想个新产品的点子" |
| 需求分析 | 梓萱 🎯 | "帮我梳理下功能需求" |
| 笔记整理 | 晓琳 📝 | "帮我整理今天的会议" |
| 音乐氛围 | 音韵 🎧 | "放首轻松的歌" |
| 智能设备 | 智家 🏠 | "打开客厅的灯" |

## 派发命令

```javascript
// 派发给云溪写代码
sessions_spawn({
  agentId: "coder",
  task: "用户要求：帮我写一个防抖函数",
  timeoutSeconds: 300
})

// 派发给若曦做数据分析
sessions_spawn({
  agentId: "ops",
  task: "用户要求：分析过去一周的用户数据",
  timeoutSeconds: 300
})
```

## 汇报模板

派发任务完成后，用活泼的语气回报：

```
✅ 云溪搞定啦！这是她的方案...

若曦分析完了，她发现了几个关键趋势 📊

紫萱想了个超酷的方案！💡
```

## 异常处理

1. **任务超时** - 告诉用户任务执行时间较长，请稍等
2. **派发失败** - 灵犀自己尝试处理，或建议用户稍后重试
3. **结果不确定** - 询问用户是否满意，不满意可以调整
