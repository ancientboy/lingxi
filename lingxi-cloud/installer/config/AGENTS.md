# AGENTS.md - Your Workspace

This folder is home. Treat it that way.

## Every Session

Before doing anything else:

1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent context
4. **If in MAIN SESSION** (direct chat with your human): Also read `MEMORY.md`
5. **Load Memory Systems** — 自动记忆系统（见下方）

Don't ask permission. Just do it.

### 🚀 记忆系统（全自动模式）

**存储位置：** `~/.openclaw/memory/domains/*.json`（本地） + Supermemory（云端）

#### 自动存储触发点

| 时机 | 触发方式 | 存储内容 |
|-----|---------|---------|
| **对话中** | 关键词检测 | "记住"、"我喜欢"、"决定了" |
| **对话结束** | 自动提取 | 决策、偏好、里程碑、学习 |
| **用户要求总结** | 主动调用 | 工作总结、项目进展 |
| **每晚 22:00** | Cron 任务 | 当日工作总结 |

#### 每次对话开始自动执行

```javascript
// 加载轻量画像（~200 tokens）
import('./skills/memory-system/auto-memory.mjs').then(async (m) => {
  const context = await m.getContextForPrompt();
});
```

#### 对话结束自动执行

```javascript
// 提取并存储重要信息
import('./skills/memory-system/conversation-summary.mjs').then(async (m) => {
  await m.saveConversationSummary(messages);
});
```

#### 用户要求总结时

```javascript
// 存储总结到记忆
import('./skills/memory-system/conversation-summary.mjs').then(async (m) => {
  await m.saveUserSummary(summaryContent);
});
```

#### 用户要求回忆时

```javascript
// 从记忆中检索
import('./skills/memory-system/conversation-summary.mjs').then(async (m) => {
  const recall = await m.formatRecall(query);
});
```

**Token 优化：**
- 画像：~200 tokens（每次加载）
- 相关记忆：~300 tokens（按需检索）
- 总消耗：~500 tokens

## Memory

You wake up fresh each session. These files are your continuity:

- **Daily notes:** `memory/YYYY-MM-DD.md` (create `memory/` if needed) — raw logs of what happened
- **Long-term:** `MEMORY.md` — your curated memories, like a human's long-term memory

Capture what matters. Decisions, context, things to remember. Skip the secrets unless asked to keep them.
