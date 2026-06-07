import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/pages/servers_page.dart';
import 'package:lingxicloud/pages/subscription_page.dart';
import 'package:lingxicloud/pages/login_page.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:provider/provider.dart';
import 'package:flutter/services.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  @override
  Widget build(BuildContext context) {
    final dk = Theme.of(context).brightness == Brightness.dark;
    final bg = dk ? const Color(0xFF1A1A2E) : const Color(0xFFF5F5F7);
    final cardColor = dk ? const Color(0xFF252540) : Colors.white;
    final textColor = dk ? Colors.white : Colors.black87;
    final subColor = dk ? Colors.white54 : Colors.black45;

    return Scaffold(
      backgroundColor: bg,
      body: Consumer<AppProvider>(
        builder: (context, appProvider, _) {
          final user = appProvider.user;
          final isSubscribed = user?.subscription?['plan'] != null && user?.subscription?['plan'] != 'free';
          final nickname = user?.nickname ?? '用户';
          final points = user?.points ?? 0;

          return ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              const SizedBox(height: 60),

              // === Avatar + Name ===
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 72, height: 72,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Constants.primaryColor, Color(0xFF0d8a6a)]),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [BoxShadow(color: Constants.primaryColor.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))],
                      ),
                      child: Center(
                        child: Text(
                          nickname.isNotEmpty ? nickname[0].toUpperCase() : 'U',
                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(nickname, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: textColor)),
                    const SizedBox(height: 4),
                    Text('ID: ${user?.id.substring(0, 8) ?? ''}...', style: TextStyle(fontSize: 13, color: subColor, fontFamily: 'monospace')),
                    const SizedBox(height: 8),
                    // Subscription badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: isSubscribed ? Constants.primaryColor.withOpacity(0.1) : Colors.orange.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(isSubscribed ? Icons.workspace_premium : Icons.diamond, size: 16,
                              color: isSubscribed ? Constants.primaryColor : Colors.orange),
                          const SizedBox(width: 6),
                          Text(
                            isSubscribed ? '订阅会员' : '免费用户',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: isSubscribed ? Constants.primaryColor : Colors.orange,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 12),

              // Points card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)]),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: Colors.orange.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                      child: const Icon(Icons.diamond, color: Colors.orange, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('积分余额', style: TextStyle(fontSize: 13, color: subColor)),
                      Text('$points', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: textColor)),
                    ])),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // === Menu sections ===
              Text('  服务', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: subColor)),
              const SizedBox(height: 8),

              _menuItem(Icons.workspace_premium_outlined, '订阅管理', '升级获取更多功能', const Color(0xFFF59E0B), cardColor, textColor, subColor, () {
                Navigator.push(context, MaterialPageRoute(builder: (_) => const SubscriptionPage()));
              }),
              _menuItem(Icons.dns_outlined, '设备管理', '管理 OpenClaw 服务器', const Color(0xFF6366F1), cardColor, textColor, subColor, () {
                Navigator.push(context, MaterialPageRoute(builder: (_) => const ServersPage()));
              }),
              _menuItem(Icons.card_giftcard, '邀请好友', '邀好友赚积分', const Color(0xFFEC4899), cardColor, textColor, subColor, () {
                _showInviteDialog();
              }),
              _menuItem(Icons.lock_outline, '修改密码', '', const Color(0xFF9CA3AF), cardColor, textColor, subColor, () {
                _showChangePasswordDialog();
              }),

              const SizedBox(height: 20),
              Text('  设置', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: subColor)),
              const SizedBox(height: 8),

              // Theme toggle
              _menuSwitch(Icons.dark_mode_outlined, '深色模式', cardColor, textColor, subColor, dk, (v) {
                Provider.of<AppProvider>(context, listen: false).toggleTheme();
              }),

              _menuItem(Icons.info_outline, '关于', 'v1.8.0', const Color(0xFF9CA3AF), cardColor, textColor, subColor, () {
                showAboutDialog(context: context, applicationName: '灵犀云', applicationVersion: 'v1.8.0', applicationIcon: Container(
                  width: 48, height: 48, decoration: BoxDecoration(gradient: const LinearGradient(colors: [Constants.primaryColor, Color(0xFF0d8a6a)]), borderRadius: BorderRadius.circular(12)),
                  child: const Center(child: Text('L', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white))),
                ));
              }),

              const SizedBox(height: 20),

              // Logout
              Container(
                width: double.infinity,
                decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(14)),
                child: Material(
                  color: Colors.transparent,
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('退出登录'),
                          content: const Text('确定要退出吗？'),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
                            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('确定', style: TextStyle(color: Colors.red))),
                          ],
                        ),
                      );
                      if (ok == true) {
                        await Provider.of<AppProvider>(context, listen: false).logout();
                        if (mounted) {
                          Navigator.of(context).pushAndRemoveUntil(
                            MaterialPageRoute(builder: (_) => const LoginPage()),
                            (route) => false,
                          );
                        }
                      }
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.logout, color: Colors.red.shade400, size: 20),
                          const SizedBox(width: 8),
                          Text('退出登录', style: TextStyle(color: Colors.red.shade400, fontWeight: FontWeight.w600, fontSize: 15)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 40),
            ],
          );
        },
      ),
    );
  }

  Widget _menuItem(IconData icon, String title, String subtitle, Color color, Color cardColor, Color textColor, Color subColor, VoidCallback onTap) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(14)),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                  child: Icon(icon, color: color, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: textColor)),
                  if (subtitle.isNotEmpty) Text(subtitle, style: TextStyle(fontSize: 12, color: subColor)),
                ])),
                Icon(Icons.chevron_right, color: subColor, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _menuSwitch(IconData icon, String title, Color cardColor, Color textColor, Color subColor, bool value, ValueChanged<bool> onChanged) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: const Color(0xFF6366F1).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, color: const Color(0xFF6366F1), size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(title, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: textColor))),
            Switch(value: value, onChanged: onChanged, activeColor: Constants.primaryColor),
          ],
        ),
      ),
    );
  }

  void _showInviteDialog() {
    final user = Provider.of<AppProvider>(context, listen: false).user;
    final inviteCode = user?.userInviteCode ?? '-';
    final inviteCount = user?.inviteCount ?? 0;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Text('🎁 邀请好友', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const Spacer(),
              IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close)),
            ]),
            const SizedBox(height: 16),
            Center(child: Text('每邀请一位好友注册，获得 100 积分奖励', style: TextStyle(fontSize: 14, color: Colors.grey.shade600))),
            const SizedBox(height: 20),
            Container(
              width: double.infinity, padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(12)),
              child: Column(children: [
                const Text('我的邀请码', style: TextStyle(fontSize: 12, color: Colors.grey)),
                const SizedBox(height: 8),
                Text(inviteCode, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 2)),
              ]),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: inviteCode));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ 邀请码已复制')));
                },
                icon: const Icon(Icons.copy, size: 16), label: const Text('复制邀请码'),
                style: ElevatedButton.styleFrom(backgroundColor: Constants.primaryColor, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)), padding: const EdgeInsets.symmetric(vertical: 12)),
              ),
            ),
            const SizedBox(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              _inviteStat(inviteCount.toString(), '已邀请'),
              const SizedBox(width: 40),
              _inviteStat('${inviteCount * 100}', '获得积分'),
            ]),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _inviteStat(String value, String label) {
    return Column(children: [
      Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
      Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
    ]);
  }

  void _showChangePasswordDialog() {
    final oldCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();
    bool loading = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Container(
          decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const Text('🔒 修改密码', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const Spacer(),
                IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close)),
              ]),
              const SizedBox(height: 16),
              TextField(controller: oldCtrl, obscureText: true, decoration: const InputDecoration(labelText: '当前密码', border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(8))))),
              const SizedBox(height: 12),
              TextField(controller: newCtrl, obscureText: true, decoration: const InputDecoration(labelText: '新密码', border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(8))))),
              const SizedBox(height: 12),
              TextField(controller: confirmCtrl, obscureText: true, decoration: const InputDecoration(labelText: '确认新密码', border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(8))))),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: loading ? null : () async {
                    if (newCtrl.text != confirmCtrl.text) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('两次密码不一致')));
                      return;
                    }
                    if (newCtrl.text.length < 6) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('密码至少6位')));
                      return;
                    }
                    setModalState(() => loading = true);
                    try {
                      await ApiService().changePassword(currentPassword: oldCtrl.text, newPassword: newCtrl.text);
                      if (mounted) {
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ 密码修改成功')));
                      }
                    } catch (e) {
                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('修改失败: $e')));
                    } finally {
                      setModalState(() => loading = false);
                    }
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: Constants.primaryColor, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                  child: loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('确认修改', style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
