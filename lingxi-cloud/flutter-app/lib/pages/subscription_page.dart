import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:url_launcher/url_launcher.dart';

class SubscriptionPage extends StatefulWidget {
  const SubscriptionPage({super.key});

  @override
  State<SubscriptionPage> createState() => _SubscriptionPageState();
}

class _SubscriptionPageState extends State<SubscriptionPage> {
  Map<String, dynamic>? _subscriptionData;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final data = await ApiService().get('/api/subscription/current');
      if (data.data['success'] == true) {
        setState(() {
          _subscriptionData = data.data['data'] as Map<String, dynamic>?;
          _isLoading = false;
        });
      } else {
        setState(() {
          _error = data.data['error'] ?? '加载失败';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _subscribePlan(String planId) async {
    try {
      // 检查是否已登录
      final token = ApiService().getAuthToken();
      debugPrint('🔑 Token: ${token?.substring(0, 20)}...');
      
      if (token == null || token.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('请先登录')),
        );
        return;
      }

      // 显示加载中
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(child: CircularProgressIndicator()),
      );

      debugPrint('📤 发送订阅请求: planId=$planId, baseUrl=${Constants.baseUrl}');
      
      // 调用支付宝订阅 API
      final response = await ApiService().post('/api/alipay/subscribe', data: {'planId': planId});
      
      debugPrint('📥 订阅响应: status=${response.statusCode}, data=${response.data}');
      
      Navigator.pop(context); // 关闭加载中

      final data = response.data;
      // 后端返回格式: { success: true, data: { payUrl: ..., outTradeNo: ... } }
      final payUrl = data['data']?['payUrl'] ?? data['payUrl'];
      if (data['success'] == true && payUrl != null) {
        // 打开支付宝支付链接
        debugPrint('🔗 支付链接: $payUrl');
        
        final uri = Uri.parse(payUrl);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
          
          // 显示提示
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('请在浏览器中完成支付，支付完成后返回此页面')),
            );
          }
        } else {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('无法打开支付链接')),
            );
          }
        }
      } else {
        final errorMsg = data['error'] ?? data['message'] ?? '创建订单失败';
        debugPrint('❌ 订阅失败: $errorMsg');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('订阅失败: $errorMsg')),
          );
        }
      }
    } catch (e, stack) {
      debugPrint('❌ 订阅异常: $e\n$stack');
      if (mounted) {
        Navigator.pop(context); // 关闭加载中（如果还在显示）
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('支付异常: $e')),
        );
      }
    }
  }

  Future<void> _buyCreditPack(String packId) async {
    try {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(child: CircularProgressIndicator()),
      );

      final response = await ApiService().post('/api/alipay/credit-pack', data: {'packId': packId});
      Navigator.pop(context);

      final data = response.data;
      // 后端返回格式: { success: true, data: { payUrl: ..., outTradeNo: ... } }
      final payUrl = data['data']?['payUrl'] ?? data['payUrl'];
      if (data['success'] == true && payUrl != null) {
        final uri = Uri.parse(payUrl);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(data['error'] ?? '创建订单失败')),
          );
        }
      }
    } catch (e) {
      Navigator.pop(context);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('支付失败: $e')),
        );
      }
    }
  }

  Future<void> _claimTrial() async {
    try {
      final response = await ApiService().post('/api/subscription/trial');
      if (response.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('🎉 试用已开启！')),
        );
        _loadData();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response.data['error'] ?? '开启试用失败')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('开启试用失败: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('订阅管理'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('加载失败: $_error'))
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final sub = _subscriptionData?['subscription'] as Map<String, dynamic>?;
    final credits = _subscriptionData?['credits'] as Map<String, dynamic>? ?? {};
    final plans = _subscriptionData?['plans'] as Map<String, dynamic>? ?? {};
    final creditPacks = _subscriptionData?['creditPacks'] as List<dynamic>? ?? [];

    final currentPlan = sub?['plan'] ?? 'free';
    final balance = credits['balance'] ?? 0;
    final freeDaily = credits['freeDaily'] ?? 100;
    final freeDailyUsed = credits['freeDailyUsed'] ?? 0;
    final trialUsed = sub?['trialUsed'] ?? false;

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        // 当前状态卡片
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: currentPlan == 'free'
                  ? [Colors.grey.shade600, Colors.grey.shade800]
                  : [Constants.primaryColor, const Color(0xFF4F46E5)],
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: (currentPlan == 'free' ? Colors.grey : Constants.primaryColor).withOpacity(0.3),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    currentPlan == 'free' ? Icons.person : Icons.star_rounded,
                    color: Colors.white,
                    size: 32,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    ' ${sub?['planName'] ?? 'Free'}',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Icon(Icons.monetization_on, color: Colors.white70, size: 16),
                  const SizedBox(width: 8),
                  Text(
                    '积分余额: $balance',
                    style: const TextStyle(color: Colors.white70, fontSize: 14),
                  ),
                  if (currentPlan == 'free') ...[
                    const SizedBox(width: 16),
                    const Icon(Icons.bolt, color: Colors.white70, size: 16),
                    const SizedBox(width: 4),
                    Text(
                      '今日剩余: ${freeDaily - freeDailyUsed}/$freeDaily',
                      style: const TextStyle(color: Colors.white70, fontSize: 14),
                    ),
                  ],
                ],
              ),
              if (!trialUsed && currentPlan == 'free') ...[
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _claimTrial,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Constants.primaryColor,
                    ),
                    child: const Text('开启 3 天免费试用'),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 32),

        // 套餐选择
        const Text(
          '选择套餐',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),

        // Lite 套餐
        if (plans['lite'] != null)
          _buildPlanCard(
            plan: plans['lite'] as Map<String, dynamic>,
            isCurrent: currentPlan == 'lite',
            onSelect: () => _subscribePlan('lite'),
          ),
        const SizedBox(height: 12),

        // Pro 套餐
        if (plans['pro'] != null)
          _buildPlanCard(
            plan: plans['pro'] as Map<String, dynamic>,
            isCurrent: currentPlan == 'pro',
            onSelect: () => _subscribePlan('pro'),
            isRecommended: true,
          ),
        const SizedBox(height: 32),

        // 积分包
        const Text(
          '积分包',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: creditPacks.map<Widget>((pack) {
            final p = pack as Map<String, dynamic>;
            return _buildCreditPackCard(
              name: p['name'] ?? '',
              price: p['price'] ?? 0,
              credits: p['credits'] ?? 0,
              bonus: (p['bonus'] ?? 0).toDouble(),
              onSelect: () => _buyCreditPack(p['id']),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildPlanCard({
    required Map<String, dynamic> plan,
    required bool isCurrent,
    required VoidCallback onSelect,
    bool isRecommended = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isRecommended ? Constants.primaryColor.withOpacity(0.05) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: isRecommended ? Border.all(color: Constants.primaryColor, width: 2) : null,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(
                    plan['name'] ?? '',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  if (isRecommended) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Constants.primaryColor,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text('推荐', style: TextStyle(color: Colors.white, fontSize: 12)),
                    ),
                  ],
                ],
              ),
              Text(
                '¥${plan['price']}/月',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Constants.primaryColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            '${plan['credits']} 积分/月 · ${plan['serverSpec'] ?? '独享服务器'}',
            style: TextStyle(color: Colors.grey.shade600),
          ),
          const SizedBox(height: 8),
          // 套餐详细说明
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildFeatureItem('解锁 8 个 AI Agent 团队'),
              _buildFeatureItem('独立 OpenClaw 服务器'),
              _buildFeatureItem('优先技术支持'),
            ],
          ),
          const SizedBox(height: 12),
          if (!isCurrent)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onSelect,
                style: ElevatedButton.styleFrom(
                  backgroundColor: isRecommended ? Constants.primaryColor : null,
                ),
                child: const Text('立即订阅'),
              ),
            )
          else
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: Text('当前套餐', style: TextStyle(color: Colors.grey)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFeatureItem(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Icon(Icons.check_circle, size: 16, color: Constants.primaryColor),
          const SizedBox(width: 8),
          Text(text, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
        ],
      ),
    );
  }

  Widget _buildCreditPackCard({
    required String name,
    required int price,
    required int credits,
    required double bonus,
    required VoidCallback onSelect,
  }) {
    final totalCredits = credits + (credits * bonus).toInt();
    
    return GestureDetector(
      onTap: onSelect,
      child: Container(
        width: 160,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          children: [
            Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('¥$price', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Constants.primaryColor)),
            const SizedBox(height: 4),
            Text(
              bonus > 0 ? '$totalCredits 积分 (+${(bonus * 100).toInt()}%)' : '$credits 积分',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }
}
