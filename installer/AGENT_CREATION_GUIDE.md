# AGENT_CREATION_GUIDE.md - 新增团队成员指南

当需要添加新的 Agent 时，按以下步骤操作：

## 1. 创建 Agent 配置

### 1.1 创建目录
```bash
mkdir -p installer/agents/{agent-id}
```

### 1.2 创建 SOUL.md 模板
```markdown
# SOUL.md - {名字}

_你是{名字}，{角色描述}。_

## 核心身份
...

## 性格特点
...

## 专长领域
- 专长1
- 专长2

## 工作方式
...

## 说话风格
...

## 记住
...
```

## 2. 更新配置文件

### 2.1 installer/config/openclaw.json
```json
{
  "agents": {
    "list": [
      // 在这里添加新成员
      {
        "id": "new-agent",
        "name": "新名字",
        "workspace": "~/.openclaw/workspace-new-agent",
        "agentDir": "~/.openclaw/agents/new-agent/agent"
      }
    ]
  }
}
```

### 2.2 更新 subagents.allowAgents
```json
{
  "id": "main",
  "subagents": {
    "allowAgents": [
      "coder", "ops", "inventor", "pm", "noter", "media", "smart",
      "new-agent"  // 添加新成员
    ]
  }
}
```

### 2.3 更新 tools.agentToAgent
```json
{
  "tools": {
    "agentToAgent": {
      "allow": [
        "main", "coder", "ops", "inventor", "pm", "noter", "media", "smart",
        "new-agent"  // 添加新成员
      ]
    }
  }
}
```

## 3. 更新灵犀配置

### 3.1 TEAM.md
在团队表格中添加：
```markdown
| new-agent | 新名字 🎯 | 专长描述 | 触发关键词1, 关键词2 |
```

### 3.2 触发关键词
在调度规则中添加：
```javascript
const keywords = {
  // 现有成员...
  'new-agent': ['关键词1', '关键词2', '关键词3']
};
```

## 4. 更新打包脚本

编辑 `installer/create-user-package.sh`：
```bash
for agent in lingxi coder ops inventor pm noter media smart new-agent; do
  # ...
done
```

## 5. 更新后端代码

### 5.1 agents.js - AGENT_INFO
```javascript
const AGENT_INFO = {
  // 现有成员...
  'new-agent': { id: 'new-agent', name: '新名字', emoji: '🎯', desc: '专长描述', agentDir: 'new-agent' }
};
```

### 5.2 deploy.js - quickGeneratePackage
更新 agentList 数组。

## 6. 测试验证

```bash
# 1. 本地测试
cd installer
./create-user-package.sh test-user test-token test-session

# 2. 检查生成的包
ls releases/users/lingxi-team-test-user-*/

# 3. 验证配置
cat releases/users/lingxi-team-test-user-*/.openclaw/openclaw.json | grep new-agent
```

## 检查清单

- [ ] 创建 installer/agents/{id}/SOUL.md
- [ ] 更新 installer/config/openclaw.json
- [ ] 更新灵犀 TEAM.md 触发关键词
- [ ] 更新 subagents.allowAgents
- [ ] 更新 tools.agentToAgent.allow
- [ ] 更新 create-user-package.sh
- [ ] 更新 backend/routes/agents.js
- [ ] 提交 Git
- [ ] 测试部署
