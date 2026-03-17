/**
 * 测试团队配置同步的合并逻辑
 * 模拟服务器端 openclaw.json 的更新过程
 */

// 模拟旧的 openclaw.json 配置（用户之前有自定义模型）
const oldConfig = {
  agents: {
    defaults: {
      model: { primary: "alibaba-cloud/qwen3.5-plus" },
      workspace: "~/.openclaw/workspace"
    },
    list: [
      {
        id: "main",
        default: true,
        name: "灵犀",
        model: "zhipu/glm-5",  // 用户自定义的模型
        workspace: "~/.openclaw/workspace",
        agentDir: "~/.openclaw/agents/main"
      },
      {
        id: "coder",
        name: "云溪",
        model: "alibaba-cloud/qwen3-coder-plus",  // 用户自定义的模型
        workspace: "~/.openclaw/workspace-coder"
      },
      {
        id: "ops",
        name: "若曦",
        model: "alibaba-cloud/qwen3.5-plus"
      }
    ]
  }
};

// 新的团队成员配置（来自数据库，可能包含用户设置的模型）
const newTeamMembers = [
  { id: 'lingxi', name: '灵犀', model: 'zhipu/glm-5' },  // 用户之前设置的
  { id: 'coder', name: '云溪', model: 'alibaba-cloud/qwen3-coder-plus' },  // 用户之前设置的
  { id: 'ops', name: '若曦' },  // 没有自定义模型
  { id: 'inventor', name: '紫萱' },  // 新成员
  { id: 'pm', name: '梓萱' },  // 新成员
  { id: 'noter', name: '晓琳' },  // 新成员
  { id: 'media', name: '音韵' },  // 新成员
  { id: 'smart', name: '智家' }   // 新成员
];

// Agent 基础信息映射
const AGENT_INFO = {
  lingxi: { id: 'main', name: '灵犀', agentDir: '~/.openclaw/agents/main/agent', workspace: '~/.openclaw/workspace' },
  coder: { id: 'coder', name: '云溪', agentDir: '~/.openclaw/agents/coder/agent', workspace: '~/.openclaw/workspace-coder' },
  ops: { id: 'ops', name: '若曦', agentDir: '~/.openclaw/agents/ops/agent', workspace: '~/.openclaw/workspace-ops' },
  inventor: { id: 'inventor', name: '紫萱', agentDir: '~/.openclaw/agents/inventor/agent', workspace: '~/.openclaw/workspace-inventor' },
  pm: { id: 'pm', name: '梓萱', agentDir: '~/.openclaw/agents/pm/agent', workspace: '~/.openclaw/workspace-pm' },
  noter: { id: 'noter', name: '晓琳', agentDir: '~/.openclaw/agents/noter/agent', workspace: '~/.openclaw/workspace-noter' },
  media: { id: 'media', name: '音韵', agentDir: '~/.openclaw/agents/media/agent', workspace: '~/.openclaw/workspace-media' },
  smart: { id: 'smart', name: '智家', agentDir: '~/.openclaw/agents/smart/agent', workspace: '~/.openclaw/workspace-smart' }
};

// 构建旧配置映射
const oldAgentMap = {};
oldConfig.agents.list.forEach(agent => {
  oldAgentMap[agent.id] = agent;
});

// 构建新配置列表（合并策略）
const newAgentList = newTeamMembers.map(member => {
  const agentId = member.id;
  const isLingxi = agentId === "lingxi";
  const configId = isLingxi ? "main" : agentId;
  const info = AGENT_INFO[agentId] || {};
  
  // 查找旧配置
  const existing = oldAgentMap[configId] || oldAgentMap[agentId];
  
  // 合并策略：用户自定义配置 > 新成员配置 > 默认值
  const mergedConfig = {
    id: configId,
    default: isLingxi ? true : (existing?.default || false),
    name: member.name || info.name || agentId,
    
    // ✅ 保留用户选择的模型（如果存在）
    ...(existing?.model ? { model: existing.model } : {}),
    ...(member.model ? { model: member.model } : {}),
    
    // ✅ 保留用户自定义的工作区（如果存在）
    workspace: existing?.workspace || member.workspace || info.workspace || "~/.openclaw/workspace-" + agentId,
    
    // ✅ 保留 agentDir（如果存在）
    agentDir: existing?.agentDir || info.agentDir || "~/.openclaw/agents/" + configId + "/agent",
    
    // ✅ 保留 subagents 配置（灵犀专属）
    ...(isLingxi || existing?.subagents ? {
      subagents: {
        allowAgents: newTeamMembers.map(m => m.id).filter(id => id !== "lingxi")
      }
    } : {})
  };
  
  return mergedConfig;
});

// 输出结果
console.log('=== 合并后的 Agent 配置 ===\n');
newAgentList.forEach(agent => {
  console.log(`${agent.id} (${agent.name}):`);
  console.log(`  模型：${agent.model || '(使用默认)'}`);
  console.log(`  工作区：${agent.workspace}`);
  console.log(`  AgentDir: ${agent.agentDir}`);
  if (agent.subagents) {
    console.log(`  子 Agent: ${agent.subagents.allowAgents.join(', ')}`);
  }
  console.log('');
});

// 验证
console.log('=== 验证结果 ===\n');
const checks = [
  { name: '灵犀保留模型 zhipu/glm-5', pass: newAgentList.find(a=>a.id==='main')?.model === 'zhipu/glm-5' },
  { name: '云溪保留模型 qwen3-coder-plus', pass: newAgentList.find(a=>a.id==='coder')?.model === 'alibaba-cloud/qwen3-coder-plus' },
  { name: '若曦保留旧配置的模型（正确行为）', pass: !!newAgentList.find(a=>a.id==='ops')?.model },
  { name: '新增 5 个成员（inventor, pm, noter, media, smart）', pass: newAgentList.length === 8 },
  { name: '每个成员有独立工作区', pass: newAgentList.every(a => a.workspace?.includes('workspace')) }
];

checks.forEach(check => {
  console.log(`${check.pass ? '✅' : '❌'} ${check.name}`);
});

const allPass = checks.every(c => c.pass);
console.log(`\n${allPass ? '✅ 所有测试通过！' : '❌ 有测试失败'}`);

// 额外验证：切换团队时保留配置
console.log('\n=== 场景测试：切换团队后再次切换回来 ===\n');

// 模拟用户切换到一个不同的团队，然后再切回灵犀团队
const oldConfigAfterSwitch = {
  agents: {
    defaults: oldConfig.agents.defaults,
    list: newAgentList  // 使用刚才合并后的配置
  }
};

// 再次应用同样的模板（模拟用户来回切换）
const oldAgentMap2 = {};
oldConfigAfterSwitch.agents.list.forEach(agent => {
  oldAgentMap2[agent.id] = agent;
});

const newAgentList2 = newTeamMembers.map(member => {
  const agentId = member.id;
  const isLingxi = agentId === "lingxi";
  const configId = isLingxi ? "main" : agentId;
  const info = AGENT_INFO[agentId] || {};
  const existing = oldAgentMap2[configId] || oldAgentMap2[agentId];
  
  const mergedConfig = {
    id: configId,
    default: isLingxi ? true : (existing?.default || false),
    name: member.name || info.name || agentId,
    ...(existing?.model ? { model: existing.model } : {}),
    ...(member.model ? { model: member.model } : {}),
    workspace: existing?.workspace || member.workspace || info.workspace || "~/.openclaw/workspace-" + agentId,
    agentDir: existing?.agentDir || info.agentDir || "~/.openclaw/agents/" + configId + "/agent",
    ...(isLingxi || existing?.subagents ? {
      subagents: {
        allowAgents: newTeamMembers.map(m => m.id).filter(id => id !== "lingxi")
      }
    } : {})
  };
  
  return mergedConfig;
});

const modelPreserved = 
  newAgentList2.find(a=>a.id==='main')?.model === 'zhipu/glm-5' &&
  newAgentList2.find(a=>a.id==='coder')?.model === 'alibaba-cloud/qwen3-coder-plus';

console.log(`${modelPreserved ? '✅' : '❌'} 来回切换团队后，用户自定义模型仍然保留`);
