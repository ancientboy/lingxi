# 🤖 Skill-Analyzer - 智能技能分析器

自动分析新技能并推荐给合适的agent。

## 功能

- ✅ **分析技能** - 读取SKILL.md并提取关键信息
- ✅ **匹配Agent** - 计算与现有agent的匹配度
- ✅ **推荐分配** - 智能推荐给最合适的agent
- ✅ **建议创建** - 不匹配时建议创建新agent

## 使用

```javascript
import analyzer from './skills/skill-analyzer/index.mjs';

// 分析新技能
const analysis = analyzer.analyzeSkill('/path/to/skill');

// 匹配现有agent
const matches = analyzer.matchAgents(analysis, existingAgents);

// 判断是否需要创建新agent
const needNewAgent = analyzer.shouldCreateNewAgent(analysis, matches);

if (needNewAgent) {
  // 生成新agent建议
  const suggestion = analyzer.suggestNewAgent(analysis);
  console.log(suggestion);
}
```

## API

### analyzeSkill(skillPath)

分析技能目录，返回分析结果：

```javascript
{
  name: "frontend-design",
  category: "development",
  keywords: ["前端", "UI", "界面"],
  complexity: "medium",
  description: "前端设计和开发工具",
  tags: ["frontend", "ui", "css"]
}
```

### matchAgents(analysis, agents)

计算与每个agent的匹配度：

```javascript
[
  { agentId: "coder", score: 95, reason: "开发类技能" },
  { agentId: "inventor", score: 30, reason: "非创意类" },
  { agentId: "ops", score: 20, reason: "非数据类" }
]
```

### shouldCreateNewAgent(analysis, matches)

判断是否需要创建新agent：

```javascript
{
  needNewAgent: false,
  bestMatch: { agentId: "coder", score: 95 },
  reason: "已有高匹配度的agent"
}
```

### suggestNewAgent(analysis)

生成新agent建议：

```javascript
{
  id: "designer",
  name: "雅琳",
  emoji: "🎨",
  role: "UI/UX 设计专家",
  personality: "细腻敏感、审美独到",
  catchphrase: "好的设计是看不见的设计。",
  skills: ["frontend-design"]
}
```

## 配置

```json
{
  "matchThreshold": 60,  // 低于此分数建议创建新agent
  "categories": {
    "development": ["coder"],
    "data": ["ops"],
    "creative": ["inventor"],
    "product": ["pm"]
  }
}
```

---

*这是让团队自动进化的核心工具！*
