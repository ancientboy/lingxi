import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/services/rpc_ws.dart';
import 'package:lingxicloud/services/lume_websocket_service.dart';
import 'package:flutter/services.dart';

class SkillsPage extends StatefulWidget {
  final void Function(String skillId, String skillName, String example)? onUseSkill;
  SkillsPage({super.key, this.onUseSkill});

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
    'coder': {'name': '云溪', 'icon': Icons.code, 'color': Color(0xFF10A37F)},
    'ops': {'name': '若曦', 'icon': Icons.bar_chart, 'color': Color(0xFFF093FB)},
    'inventor': {'name': '紫萱', 'icon': Icons.lightbulb, 'color': Color(0xFF4FACFE)},
    'pm': {'name': '梓萱', 'icon': Icons.track_changes, 'color': Color(0xFF43E97B)},
    'noter': {'name': '晓琳', 'icon': Icons.note, 'color': Color(0xFFFA709A)},
    'media': {'name': '音韵', 'icon': Icons.palette, 'color': Color(0xFF30CFD0)},
    'smart': {'name': '智家', 'icon': Icons.home, 'color': Color(0xFFA8EDEA)},
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
      if (!rpcConnected) {
        final lume = LumeWebSocketService();
        if (!lume.isConnecting) await lume.connect().catchError((_) {});
      }
      // 加载技能库
      final res = await ApiService().get('/api/skills/library');
      if (res.data['skills'] != null) {
        _allSkills = List<Map<String, dynamic>>.from(res.data['skills']);
      }
      
      // 加载已安装技能 — Lume 优先
      Set<String> installedFromApi = {};
      final lumeRes = await rpcPluginCall('skills.installed', {});
      if (lumeRes != null && lumeRes['ok'] == true) {
        final payload = lumeRes['payload'];
        final skills = payload is Map ? payload['skills'] : null;
        if (skills is List) {
          installedFromApi = skills.map((s) {
            if (s is Map) return (s['id'] ?? s['name'] ?? '').toString();
            return s.toString();
          }).where((e) => e.isNotEmpty).toSet();
        }
      }
      if (installedFromApi.isEmpty) {
        final res2 = await ApiService().get('/api/skills/installed');
        if (res2.data['skills'] != null) {
          final installed = res2.data['skills'] as List;
          installedFromApi = installed.map((s) => (s['id'] ?? s).toString()).toSet();
        }
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

  Color _skillAccent(String? agentId) {
    final c = _agentConfig[agentId]?['color'];
    return c is Color ? c : const Color(0xFF667eea);
  }

  IconData _skillIcon(Map<String, dynamic> skill) {
    final agentId = skill['agent']?.toString();
    final icon = _agentConfig[agentId]?['icon'];
    if (icon is IconData) return icon;
    return Icons.extension_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDarkMode ? Color(0xFF202123) : Colors.white;
    final textColor = isDarkMode ? Color(0xFFECECF1) : Colors.black87;
    
    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        leading: IconButton(
          icon: Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('技能库', style: TextStyle(color: textColor)),
        backgroundColor: bgColor,
        iconTheme: IconThemeData(color: textColor),
      ),
      body: _isLoading
          ? Center(child: CircularProgressIndicator(color: Constants.primaryColor))
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final categories = [
      {'id': 'all', 'name': '全部', 'icon': Icons.apps},
      {'id': 'builtin', 'name': '官方', 'icon': Icons.verified},
      ..._agentConfig.entries.map((e) => {'id': e.key, 'name': e.value['name'], 'icon': e.value['icon']}),
    ];

    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final cat = categories[i];
          final isActive = _currentCategory == cat['id'];
          return GestureDetector(
            onTap: () => setState(() => _currentCategory = cat['id'] as String),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isActive ? const Color(0xFF667eea) : (isDark ? const Color(0xFF2A2A40) : const Color(0xFFF0EDE8)),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(cat['icon'] as IconData, size: 14, color: isActive ? Colors.white : textColor.withOpacity(0.7)),
                  const SizedBox(width: 6),
                  Text(cat['name'] as String, style: TextStyle(fontSize: 13, fontWeight: isActive ? FontWeight.w600 : FontWeight.normal, color: isActive ? Colors.white : textColor)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildToolbar(Color textColor) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              style: TextStyle(color: textColor, fontSize: 14),
              decoration: InputDecoration(
                hintText: '搜索技能...',
                hintStyle: TextStyle(color: Colors.grey.shade400),
                prefixIcon: Icon(Icons.search, size: 20, color: Colors.grey.shade400),
                filled: true,
                fillColor: isDark ? const Color(0xFF2A2A40) : const Color(0xFFF5F1EB),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 10),
          _buildFilterChip('全部', 'all', textColor),
          const SizedBox(width: 6),
          _buildFilterChip('已安装', 'installed', textColor),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String filter, Color textColor) {
    final isActive = _currentFilter == filter;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: () => setState(() => _currentFilter = filter),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? const Color(0xFF667eea).withOpacity(0.12) : (isDark ? const Color(0xFF2A2A40) : const Color(0xFFF5F1EB)),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isActive ? const Color(0xFF667eea) : Colors.transparent),
        ),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: isActive ? FontWeight.w600 : FontWeight.normal, color: isActive ? const Color(0xFF667eea) : textColor.withOpacity(0.7))),
      ),
    );
  }

  Widget _buildSkillsGrid(Color textColor, bool isDarkMode) {
    final skills = _getFilteredSkills();
    
    if (skills.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inventory_2_outlined, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              _currentFilter == 'installed' ? '该分类下暂无已安装的技能' : '暂无技能',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      );
    }
    
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 0.78,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: skills.length,
      itemBuilder: (context, i) => _buildSkillCard(skills[i], textColor, isDarkMode),
    );
  }

  Widget _buildSkillCard(Map<String, dynamic> skill, Color textColor, bool isDarkMode) {
    final agentId = skill['agent']?.toString() ?? '';
    final agentConfig = _agentConfig[agentId];
    final isInstalled = _installedSkills.contains(skill['id']) || skill['builtin'] == true;
    final accent = _skillAccent(agentId);
    final cardBg = isDarkMode ? const Color(0xFF252540) : Colors.white;

    return Material(
      color: cardBg,
      borderRadius: BorderRadius.circular(16),
      elevation: isDarkMode ? 0 : 1,
      shadowColor: Colors.black.withOpacity(0.06),
      child: InkWell(
        onTap: () => _showSkillDetail(skill, textColor, isDarkMode),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [accent, accent.withOpacity(0.65)]),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(_skillIcon(skill), color: Colors.white, size: 20),
                ),
                const Spacer(),
                if (isInstalled)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: const Color(0xFF22C55E).withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
                    child: const Text('已安装', style: TextStyle(fontSize: 10, color: Color(0xFF22C55E), fontWeight: FontWeight.w600)),
                  ),
              ]),
              const SizedBox(height: 12),
              Text(
                skill['name']?.toString() ?? '未知技能',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: textColor),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (agentConfig != null) ...[
                const SizedBox(height: 4),
                Text(agentConfig['name'] as String, style: TextStyle(fontSize: 11, color: accent)),
              ],
              const SizedBox(height: 6),
              Expanded(
                child: Text(
                  skill['shortDesc']?.toString() ?? skill['description']?.toString() ?? '',
                  style: TextStyle(fontSize: 12, height: 1.4, color: isDarkMode ? Colors.white54 : Colors.grey.shade600),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                height: 34,
                child: isInstalled
                    ? ElevatedButton.icon(
                        onPressed: () => _useSkill(skill),
                        icon: const Icon(Icons.play_arrow, size: 16),
                        label: const Text('使用', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF667eea),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      )
                    : ElevatedButton.icon(
                        onPressed: () => _installAndUse(skill),
                        icon: const Icon(Icons.download_rounded, size: 16),
                        label: const Text('安装并使用', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: accent,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
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
      backgroundColor: isDarkMode ? Color(0xFF343541) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => SingleChildScrollView(
          controller: scrollController,
          padding: EdgeInsets.all(20),
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
                    icon: Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              SizedBox(height: 12),
              
              // Agent 标签
              if (skill['agent'] != null && _agentConfig[skill['agent']] != null)
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: (_agentConfig[skill['agent']]!['color'] as Color).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(_agentConfig[skill['agent']]!['icon'] as IconData, size: 16, 
                           color: _agentConfig[skill['agent']]!['color']),
                      SizedBox(width: 8),
                      Text(_agentConfig[skill['agent']]!['name'] as String, 
                           style: TextStyle(color: _agentConfig[skill['agent']]!['color'])),
                    ],
                  ),
                ),
              SizedBox(height: 16),
              
              // 详细描述
              if (skill['fullDesc'] != null) ...[
                _buildSectionTitle('📋 详细说明', textColor),
                Text(skill['fullDesc'], style: TextStyle(color: isDarkMode ? Color(0xFFECECF1) : Colors.black87)),
                SizedBox(height: 16),
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
                SizedBox(height: 16),
              ],
              
              // 使用示例
              if (skill['example'] != null) ...[
                _buildSectionTitle('使用示例', textColor),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isDarkMode ? const Color(0xFF1E1E38) : const Color(0xFFF5F1EB),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text('"${skill['example']}"', style: TextStyle(fontSize: 13, color: isDarkMode ? Colors.white70 : Colors.grey.shade700)),
                ),
                const SizedBox(height: 16),
              ],

              SizedBox(
                width: double.infinity,
                height: 46,
                child: (_installedSkills.contains(skill['id']) || skill['builtin'] == true)
                    ? ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _useSkill(skill);
                        },
                        icon: const Icon(Icons.play_arrow),
                        label: const Text('使用技能', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF667eea),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      )
                    : ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _installAndUse(skill);
                        },
                        icon: const Icon(Icons.download_rounded),
                        label: const Text('安装并使用', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _skillAccent(skill['agent']?.toString()),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
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
      padding: EdgeInsets.only(bottom: 8),
      child: Text(title, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: textColor)),
    );
  }

  // 保留给旧代码路径，卡片已内联按钮
  Widget _buildUseButton(Map<String, dynamic> skill) => const SizedBox.shrink();
  Widget _buildInstallAndUseButton(Map<String, dynamic> skill) => const SizedBox.shrink();

  // 🆕 使用技能：切换到聊天页并填充
  void _useSkill(Map<String, dynamic> skill) {
    final skillId = skill['id']?.toString() ?? '';
    final skillName = skill['name']?.toString() ?? skillId;
    final example = skill['example']?.toString() ?? skill['shortDesc']?.toString() ?? '';
    
    if (widget.onUseSkill != null) {
      // 在 MainShell 中：直接回调切换
      widget.onUseSkill!.call(skillId, skillName, example);
    } else {
      // 独立页面：复制 example 到剪贴板并提示
      if (example.isNotEmpty) {
        Clipboard.setData(ClipboardData(text: example));
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已复制示例文本到剪贴板'), backgroundColor: Constants.primaryColor),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('请返回主页使用此技能'), backgroundColor: Constants.primaryColor),
        );
      }
    }
  }

  // 🆕 安装并使用技能
  Future<void> _installAndUse(Map<String, dynamic> skill) async {
    final skillId = skill['id']?.toString() ?? '';
    final skillName = skill['name']?.toString() ?? skillId;

    // 显示加载提示
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('正在安装 $skillName...'), duration: Duration(seconds: 2)),
    );

    try {
      final res = await ApiService().post('/api/skills/install-and-use', data: {
        'skillId': skillId,
        'skillName': skillName,
      });

      if (res.data['success'] == true) {
        setState(() {
          _installedSkills.add(skillId);
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('安装成功！'), backgroundColor: Constants.primaryColor),
          );
        }
        // 安装成功后使用
        _useSkill(skill);
      } else {
        final msg = (res.data is Map)
            ? (res.data['error'] ?? res.data['message'] ?? '安装失败')
            : '安装失败';
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$skillName 安装失败: $msg'), backgroundColor: Colors.red.shade400),
          );
        }
      }
    } catch (e) {
      debugPrint('❌ 安装技能失败: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$skillName 安装失败，请检查网络后重试'), backgroundColor: Colors.red.shade400),
        );
      }
    }
  }
}
