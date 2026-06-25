/// Quick example chip for an agent.
class LumeAgentExample {
  const LumeAgentExample({required this.text, this.desc});

  final String text;
  final String? desc;
}

/// Team member / agent metadata (aligned with web AGENT_INFO).
class LumeAgent {
  const LumeAgent({
    required this.id,
    required this.name,
    required this.desc,
    this.iconKey = 'bot',
    this.examples = const [],
  });

  final String id;
  final String name;
  final String desc;
  final String iconKey;
  final List<LumeAgentExample> examples;
}
