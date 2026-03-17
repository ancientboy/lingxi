# Session: 2026-03-16 04:50:58 UTC

- **Session Key**: agent:main:main
- **Session ID**: 10facba0-4ba8-4eca-9f93-bbe0421226e5
- **Source**: webchat

## Conversation Summary

user: Sender (untrusted metadata):
```json
{
  "label": "openclaw-control-ui",
  "id": "openclaw-control-ui"
}
```

[Mon 2026-03-16 11:33 GMT+8] 我在agent列表没看到，在聊天框列表那边临时选择的可以看到
assistant: 明白了！这是两个不同的系统：

## 📌 Agent 列表 vs 会话列表的区别

**`agents_list`（Agent 列表）** 显示的是：
- **OpenClaw Subagent** 白名单
- 用于 `sessions_spawn` + `runtime="subagent"`
- 目前只配置了 `main`

**聊天框列表** 显示的是：
- 所有历史会话（包括 ACP harness 创建的）
- ACP harness 的 agent（如 codex、claude code 等）在 `acp.allowedAgents` 配置中
- 不在 `agents_list` 中

---

## 🔧 你想做什么？

**选项 1：添加更多 Subagent 到白名单**
- 在 `agents.list` 中添加新的 agent 配置
- 这些 agent 可以用 `runtime="subagent"`  spawned

**选项 2：配置 ACP Harness Agent 白名单**
- 在 `acp.allowedAgents` 中添加 agent（如 `codex`、`claude-code` 等）
- 这些用于 `runtime="acp"` 的会话

**选项 3：只是想确认这个行为是正常的**
- 是的，这是预期行为！ACP agent 本来就不在 `agents_list` 中

你具体想配置什么？🤔
user: Sender (untrusted metadata):
```json
{
  "label": "openclaw-control-ui",
  "id": "openclaw-control-ui"
}
```

[Mon 2026-03-16 11:53 GMT+8] 我现在有2个诉求。就是在webui页面-代理选择模型里面增加zhipu-glm5。要不然光acr里面有好像无法正常使用
assistant: 明白了！你想在 WebUI 的代理选择模型里看到 `zhipu/glm-5`。

问题是：虽然 zhipu provider 已经配置了 glm-5 模型，但需要在 `agents.defaults.models` 中添加别名映射，这样 WebUI 才能正确显示和选择。

让我帮你添加这个配置：


assistant: 让我换个方式，直接在 `agents.list` 中添加一个使用 zhipu/glm-5 的 agent 配置：


assistant: 触发了配置修改的频率限制，需要等待 31 秒。

不过我想先确认一下：你说的"webui 页面 - 代理选择模型"具体是指哪个页面？

1. **创建/编辑 Agent 时的模型选择下拉菜单**？
2. **会话创建时的模型选择**？
3. **还是其他地方**？

因为 `zhipu/glm-5` 已经在 `models.providers.zhipu` 中配置了，理论上 WebUI 应该能读取到。如果看不到，可能是 WebUI 只展示 `agents.defaults.models` 中已注册的模型别名。

等你确认后，我再用正确的方式配置。稍等片刻...
