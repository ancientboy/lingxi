import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:flutter/services.dart';

class SkillsPage extends StatefulWidget {
  const SkillsPage({super.key});

  @override
  State<SkillsPage> createState() => _SkillsPageState();
}

class _SkillsPageState extends State<SkillsPage> {
  List<Map<String, dynamic>> _allSkills = [];
  List<Map<String, dynamic>> _builtinSkills = [];
  Set<String> _installedSkills = {};
  bool _isLoading = true;
  String _currentCategory = 'all';
  String _currentFilter = 'all';
  String _searchQuery = '';
  
  // Agent 配置（参考 Web 版本）
  final Map<String, Map<String, dynamic>> _agentConfig = {
    'coder': {'name': '云溪', 'icon': Icons.code, 'color': const Color(0xFF10A37F)},
    'ops': {'name': '若曦', 'icon': Icons.bar_chart, 'color': const Color(0xFFF093FB)},
    'inventor': {'name': '紫萱', 'icon': Icons.lightbulb, 'color': const Color(0xFF4FACFE)},
    'pm': {'name': '梓萱', 'icon': Icons.track_changes, 'color': const Color(0xFF43E97B)},
    'noter': {'name': '晓琳', 'icon': Icons.note, 'color': const Color(0xFFFA709A)},
    'media': {'name': '音韵', 'icon': Icons.palette, 'color': const Color(0xFF30CFD0)},
    'smart': {'name': '智家', 'icon': Icons.home, 'color': const Color(0xFFA8EDEA)},
  };

  // 本地技能列表（用于当 API 返回空时）
  final List<Map<String, dynamic>> _localSkills = [
    {'id': 'clawhub', 'name': 'ClawHub', 'agent': 'smart', 'shortDesc': '技能管理工具'},
    {'id': 'web_search', 'name': '网络搜索', 'agent': 'smart', 'shortDesc': '搜索网络信息'},
    {'id': 'weather', 'name': '天气查询', 'agent': 'smart', 'shortDesc': '查询天气预报'},
    {'id': 'coding', 'name': '代码编写', 'agent': 'coder', 'shortDesc': '编写和调试代码'},
    {'id': 'analysis', 'name': '数据分析', 'agent': 'ops', 'shortDesc': '分析和可视化数据'},
  ];

  @override
  void initState() {
    super.initState();
    _loadSkills();
  }

  Future<void> _loadSkills() async {
    setState(() => _isLoading = true);

    try {
      // 加载技能库
      final res = await ApiService().get('/api/skills/library');
      if (res.data['skills'] != null) {
        _allSkills = List<Map<String, dynamic>>.from(res.data['skills']);
      }
      
      // 加载已安装技能
      final res2 = await ApiService().get('/api/skills/installed');
      Set<String> installedFromApi = {};
      if (res2.data['skills'] != null) {
        final installed = res2.data['skills'] as List;
        installedFromApi = installed.map((s) => (s['id'] ?? s).toString()).toSet();
      }
      
      // 如果 API 返回空，合并本地技能
      if (installedFromApi.isEmpty && _allSkills.isNotEmpty) {
        debugPrint('⚠️ API 返回空已安装技能，使用本地技能作为備用');
        installedFromApi = _allSkills
            .where((s) => s['id'] != null)
            .map((s) => s['id'].toString())
            .toSet();
      }
      
      _installedSkills = installedFromApi;
      
      // 加载官方技能
      final res3 = await ApiService().get('/api/skills/builtin');
      if (res3.data['skills'] != null) {
        _builtinSkills = List<Map<String, dynamic>>.from(res3.data['skills']);
      }
      
      // 如果本地技能未包含，添加到 allSkills
      for (final localSkill in _localSkills) {
        if (!_allSkills.any((s) => s['id'] == localSkill['id'])) {
          _allSkills.add(localSkill);
        }
      }
      
      setState(() => _isLoading = false);
    } catch (e) {
      debugPrint('❌ 加载技能失败: $e');
      // 出错时也使用本地技能作为 fallback
      _allSkills = List.from(_localSkills);
      _installedSkills = _localSkills.map((s) => s['id'].toString()).toSet();
      setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> _getFilteredSkills() {
    List<Map<String, dynamic>> skills;
    
    if (_currentCategory == 'builtin') {
      skills = _builtinSkills;
    } else if (_currentCategory == 'all') {
      skills = _allSkills;
    } else {
      skills = _allSkills.where((s) => s['agent'] == _currentCategory).toList();
    }
    
    if (_currentFilter == 'installed') {
      skills = skills.where((s) => _installedSkills.contains(s['id'])).toList();
    }
    
    if (_searchQuery.isNotEmpty) {
      final query = _searchQuery.toLowerCase();
      skills = skills.where((s) {
        final name = (s['name'] ?? '').toString().toLowerCase();
        final desc = (s['shortDesc'] ?? '').toString().toLowerCase();
        return name.contains(query) || desc.contains(query);
      }).toList();
    }
    
    return skills;
  }

  void _copyInstallCommand(String skillId) {
    final cmd = 'clawhub install $skillId';
    Clipboard.setData(ClipboardData(text: cmd));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('已复制安装命令'), backgroundColor: Constants.primaryColor),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDarkMode ? const Color(0xFF202123) : Colors.white;
    final textColor = isDarkMode ? const Color(0xFFECECF1) : Colors.black87;
    
    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        title: Text('技能库', style: TextStyle(color: textColor)),
        backgroundColor: bgColor,
        iconTheme: IconThemeData(color: textColor),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Constants.primaryColor))
          : Column(
              children: [
                // 分类标签
                _buildCategories(textColor),
                
                // 搜索和筛选
                _buildToolbar(textColor),
                
                // 技能列表
                Expanded(
                  child: _buildSkillsGrid(textColor, isDarkMode),
                ),
              ],
            ),
    );
  }

  Widget _buildCategories(Color textColor) {
    final categories = [
      {'id': 'all', 'name': '热门技能', 'icon': Icons.local_fire_department},
      {'id': 'builtin', 'name': '官方技能', 'icon': Icons.star},
      ..._agentConfig.entries.map((e) => {'id': e.key, 'name': e.value['name'], 'icon': e.value['icon']}),
    ];
    
    return Container(
      height: 50,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: categories.length,
        itemBuilder: (context, i) {
          final cat = categories[i];
          final isActive = _currentCategory == cat['id'];
          int count = 0;
          if (cat['id'] == 'all') {
            count = _allSkills.length;
          } else if (cat['id'] == 'builtin') {
            count = _builtinSkills.length;
          } else {
            count = _allSkills.where((s) => s['agent'] == cat['id']).length;
          }
          
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: FilterChip(
              selected: isActive,
              label: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(cat['icon'] as IconData, size: 16, color: isActive ? Colors.white : textColor),
                  const SizedBox(width: 4),
                  Text(cat['name'] as String, style: TextStyle(color: isActive ? Colors.white : textColor)),
                  const SizedBox(width: 4),
                  Text('($count)', style: TextStyle(fontSize: 12, color: isActive ? Colors.white70 : Colors.grey)),
                ],
              ),
              onSelected: (_) => setState(() => _currentCategory = cat['id'] as String),
              selectedColor: Constants.primaryColor,
              backgroundColor: Colors.grey.shade100,
            ),
          );
        },
      ),
    );
  }

  Widget _buildToolbar(Color textColor) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          // 搜索框
          Expanded(
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: '搜索技能...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // 筛选按钮
          _buildFilterChip('全部', 'all'),
          const SizedBox(width: 8),
          _buildFilterChip('已安装', 'installed'),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String filter) {
    final isActive = _currentFilter == filter;
    return FilterChip(
      selected: isActive,
      label: Text(label),
      onSelected: (_) => setState(() => _currentFilter = filter),
      selectedColor: Constants.primaryColor,
      labelStyle: TextStyle(color: isActive ? Colors.white : null),
    );
  }

  Widget _buildSkillsGrid(Color textColor, bool isDarkMode) {
    final skills = _getFilteredSkills();
    
    if (skills.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.inventory_2_outlined, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              _currentFilter == 'installed' ? '该分类下暂无已安装的技能' : '暂无技能',
              style: const TextStyle(color: Colors.grey),
            ),
          ],
        ),
      );
    }
    
    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 0.85,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: skills.length,
      itemBuilder: (context, i) => _buildSkillCard(skills[i], textColor, isDarkMode),
    );
  }

  Widget _buildSkillCard(Map<String, dynamic> skill, Color textColor, bool isDarkMode) {
    final agentId = skill['agent'] ?? '';
    final agentConfig = _agentConfig[agentId];
    final isInstalled = _installedSkills.contains(skill['id']);
    final isBuiltin = skill['builtin'] == true || _currentCategory == 'builtin';
    
    final cardBg = isDarkMode ? const Color(0xFF343541) : Colors.white;
    final agentColor = agentConfig?['color'] as Color? ?? Constants.primaryColor;
    
    return Card(
      color: cardBg,
      elevation: isDarkMode ? 0 : 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () => _showSkillDetail(skill, textColor, isDarkMode),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 头部：Agent 标签
              if (agentConfig != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: agentColor.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(agentConfig['icon'] as IconData, size: 12, color: agentColor),
                      const SizedBox(width: 4),
                      Text(agentConfig['name'] as String, style: TextStyle(fontSize: 11, color: agentColor)),
                    ],
                  ),
                ),
              const SizedBox(height: 8),
              
              // 名称
              Text(
                skill['name'] ?? 'Unknown',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: textColor),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              
              // 描述
              Expanded(
                child: Text(
                  skill['shortDesc'] ?? skill['description'] ?? '',
                  style: TextStyle(fontSize: 12, color: isDarkMode ? Color(0xFF6E6E80) : Colors.grey.shade600),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(height: 8),
              
              // 安装状态/按钮
              if (isBuiltin || isInstalled)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Constants.primaryColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.check, size: 12, color: Constants.primaryColor),
                      SizedBox(width: 4),
                      Text('已安装', style: TextStyle(fontSize: 11, color: Constants.primaryColor)),
                    ],
                  ),
                )
              else
                OutlinedButton.icon(
                  onPressed: () => _copyInstallCommand(skill['id']),
                  icon: const Icon(Icons.copy, size: 14),
                  label: const Text('复制命令', style: TextStyle(fontSize: 11)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Constants.primaryColor,
                    side: const BorderSide(color: Constants.primaryColor),
                    minimumSize: const Size(0, 28),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSkillDetail(Map<String, dynamic> skill, Color textColor, bool isDarkMode) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDarkMode ? const Color(0xFF343541) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => SingleChildScrollView(
          controller: scrollController,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 标题
              Row(
                children: [
                  Expanded(
                    child: Text(
                      skill['name'] ?? '',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: textColor),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              
              // Agent 标签
              if (skill['agent'] != null && _agentConfig[skill['agent']] != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: (_agentConfig[skill['agent']]!['color'] as Color).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(_agentConfig[skill['agent']]!['icon'] as IconData, size: 16, 
                           color: _agentConfig[skill['agent']]!['color']),
                      const SizedBox(width: 8),
                      Text(_agentConfig[skill['agent']]!['name'] as String, 
                           style: TextStyle(color: _agentConfig[skill['agent']]!['color'])),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
              
              // 详细描述
              if (skill['fullDesc'] != null) ...[
                _buildSectionTitle('📋 详细说明', textColor),
                Text(skill['fullDesc'], style: TextStyle(color: isDarkMode ? Color(0xFFECECF1) : Colors.black87)),
                const SizedBox(height: 16),
              ],
              
              // 功能特性
              if (skill['features'] != null && (skill['features'] as List).isNotEmpty) ...[
                _buildSectionTitle('✨ 功能特性', textColor),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: (skill['features'] as List).map((f) => Chip(
                    label: Text(f.toString()),
                    backgroundColor: Constants.primaryColor.withOpacity(0.1),
                  )).toList(),
                ),
                const SizedBox(height: 16),
              ],
              
              // 使用示例
              if (skill['example'] != null) ...[
                _buildSectionTitle('💡 使用示例', textColor),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isDarkMode ? Color(0xFF202123) : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('"${skill['example']}"', style: TextStyle(color: isDarkMode ? Color(0xFF6E6E80) : Colors.grey.shade600)),
                ),
                const SizedBox(height: 16),
              ],
              
              // 使用用例
              if (skill['using_case'] != null) ...[
                _buildSectionTitle('🎓 使用用例', textColor),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isDarkMode ? Color(0xFF202123) : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(skill['using_case'], style: TextStyle(color: isDarkMode ? Color(0xFF6E6E80) : Colors.grey.shade600)),
                ),
                const SizedBox(height: 16),
              ],
              
              // 安装命令
              _buildSectionTitle('🔧 安装命令', textColor),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isDarkMode ? Color(0xFF202123) : Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        skill['installCommand'] ?? 'clawhub install ${skill['id']}',
                        style: TextStyle(fontFamily: 'monospace', color: textColor),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.copy),
                      onPressed: () {
                        final cmd = skill['installCommand'] ?? 'clawhub install ${skill['id']}';
                        Clipboard.setData(ClipboardData(text: cmd));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('已复制')),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title, Color textColor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: textColor)),
    );
  }
}
