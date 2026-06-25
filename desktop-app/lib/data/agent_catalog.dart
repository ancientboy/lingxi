import '../models/lume_agent.dart';

/// Static agent catalog — mirrors `AGENT_INFO` in chat.js.
class AgentCatalog {
  static const Map<String, LumeAgent> agents = {
    'lingxi': LumeAgent(
      id: 'lingxi',
      name: '灵犀',
      desc: '智能调度 · 日程管理',
      iconKey: 'zap',
      examples: [
        LumeAgentExample(text: '帮我安排明天的日程', desc: '日程规划'),
        LumeAgentExample(text: '提醒我下午3点开会', desc: '设置提醒'),
        LumeAgentExample(text: '帮我起草一封工作邮件', desc: '邮件撰写'),
        LumeAgentExample(text: '这个任务应该派给谁？', desc: '智能调度'),
      ],
    ),
    'coder': LumeAgent(
      id: 'coder',
      name: '云溪',
      desc: '全栈开发 · 编程专家',
      iconKey: 'code',
      examples: [
        LumeAgentExample(text: '帮我写一个 Python 爬虫', desc: '代码生成'),
        LumeAgentExample(text: '设计一个用户登录 API', desc: 'API 设计'),
      ],
    ),
    'ops': LumeAgent(
      id: 'ops',
      name: '若曦',
      desc: '增长运营 · 数据专家',
      iconKey: 'chart',
      examples: [
        LumeAgentExample(text: '分析一下这周的用户增长数据', desc: '数据分析'),
        LumeAgentExample(text: '给我一个 SEO 优化方案', desc: 'SEO 优化'),
      ],
    ),
    'inventor': LumeAgent(
      id: 'inventor',
      name: '紫萱',
      desc: '内容创意 · 文案总监',
      iconKey: 'lightbulb',
      examples: [
        LumeAgentExample(text: '写一个产品宣传文案', desc: '文案创作'),
        LumeAgentExample(text: '设计一个营销活动方案', desc: '活动策划'),
      ],
    ),
    'pm': LumeAgent(
      id: 'pm',
      name: '梓萱',
      desc: '产品设计 · 需求专家',
      iconKey: 'target',
      examples: [
        LumeAgentExample(text: '帮我写一个产品需求文档', desc: '需求分析'),
        LumeAgentExample(text: '设计一个用户注册流程', desc: '流程设计'),
      ],
    ),
    'noter': LumeAgent(
      id: 'noter',
      name: '晓琳',
      desc: '学习顾问 · 知识管理',
      iconKey: 'file',
      examples: [
        LumeAgentExample(text: '翻译这段话成英文', desc: '翻译服务'),
        LumeAgentExample(text: '帮我整理一下今天的会议笔记', desc: '笔记整理'),
      ],
    ),
    'media': LumeAgent(
      id: 'media',
      name: '音韵',
      desc: '多媒体创作 · AI绘图',
      iconKey: 'palette',
      examples: [
        LumeAgentExample(text: '生成一张科幻风格的封面图', desc: 'AI 绘图'),
        LumeAgentExample(text: '写一个短视频脚本', desc: '剧本创作'),
      ],
    ),
    'smart': LumeAgent(
      id: 'smart',
      name: '智家',
      desc: '效率工具 · 自动化专家',
      iconKey: 'home',
      examples: [
        LumeAgentExample(text: '写一个自动备份脚本', desc: '脚本编写'),
        LumeAgentExample(text: '帮我设计一个自动化工作流', desc: '流程自动化'),
      ],
    ),
    'reviewer': LumeAgent(
      id: 'reviewer',
      name: '清源',
      desc: '代码审查 · 质量把关',
      iconKey: 'search',
      examples: [
        LumeAgentExample(text: '审查这段代码有没有安全问题', desc: '安全审查'),
      ],
    ),
    'qa': LumeAgent(
      id: 'qa',
      name: '知微',
      desc: '质量保证 · 测试专家',
      iconKey: 'check',
      examples: [
        LumeAgentExample(text: '为这个功能设计测试用例', desc: '用例设计'),
      ],
    ),
  };

  static LumeAgent resolve(String id) {
    return agents[id] ??
        LumeAgent(id: id, name: id, desc: 'AI 助手', iconKey: 'bot');
  }

  static List<LumeAgent> forIds(List<String> ids) {
    if (ids.isEmpty) return [agents['lingxi']!];
    return ids.map((id) => resolve(id)).toList();
  }
}
