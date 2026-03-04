import 'package:flutter/material.dart';
import 'package:lingxicloud/models/user.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/services/websocket_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'dart:io';
import 'dart:convert';
import 'package:lingxicloud/utils/constants.dart';
import 'package:mime_type/mime_type.dart';
import 'package:http_parser/http_parser.dart';

class AppProvider with ChangeNotifier {
  User? _user;
  bool _isLoading = true;
  String? _error;

  User? get user => _user;
  bool get isLoading => _isLoading;
  bool get isLoggedIn => _user != null;
  String? get error => _error;
  
  // 设置用户
  void setUser(User user) {
    _user = user;
    notifyListeners();
  }

  // 初始化
  Future<void> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('lingxi_token');

      if (token != null) {
        ApiService().setAuthToken(token);
        _user = await _loadUser();
      }
    } catch (e) {
      _error = e.toString();
      debugPrint('AppProvider init error: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // 加载用户信息
  Future<User?> _loadUser() async {
    try {
      final response = await ApiService().get('/api/auth/me');
      final data = response.data;
      if (data['success'] == true && data['user'] != null) {
        final user = User.fromJson(data['user']);
        _user = user;
        return user;
      } else if (data['id'] != null) {
        // 直接返回用户数据
        final user = User.fromJson(data);
        _user = user;
        return user;
      }
      return null;
    } catch (e) {
      _error = e.toString();
      debugPrint('Load user error: $e');
      return null;
    }
  }

  // 登录
  Future<bool> login(String nickname, String password) async {
    try {
      final response = await ApiService().post(
        '/api/auth/login',
        data: {'nickname': nickname, 'password': password},
      );

      final data = response.data;
      if (data['success'] != true) {
        _error = data['error'] ?? '登录失败';
        notifyListeners();
        return false;
      }

      final token = data['token']?.toString() ?? '';
      final user = User.fromJson(data['user'] ?? {});

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('lingxi_token', token);
      ApiService().setAuthToken(token);

      _user = user;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  // 注册
  Future<bool> register(String inviteCode, String nickname, String password) async {
    try {
      final response = await ApiService().post(
        '/api/auth/register',
        data: {'inviteCode': inviteCode, 'nickname': nickname, 'password': password},
      );

      final data = response.data;
      if (data['success'] != true) {
        _error = data['error'] ?? '注册失败';
        notifyListeners();
        return false;
      }

      final token = data['token']?.toString() ?? '';
      final user = User.fromJson(data['user'] ?? {});

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('lingxi_token', token);
      ApiService().setAuthToken(token);

      _user = user;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  // 登出
  Future<void> logout() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('lingxi_token');
      if (token == null) {
        debugPrint('登出失败: 未找到 token');
        return;
      }
      
      await ApiService().post('/api/auth/logout');
    } catch (e) {
      debugPrint('Logout error: $e');
    } finally {
      final prefs = await SharedPreferences.getInstance();
      await prefs.clear();
      ApiService().clearAuthToken();
      _user = null;
      WebSocketService().disconnect();
      // 确保通知监听器更新UI
      notifyListeners();
      // 给UI一点时间响应
      await Future.delayed(const Duration(milliseconds: 100));
    }
  }

  // 更新用户信息
  Future<bool> updateUser(Map<String, dynamic> data) async {
    try {
      final response = await ApiService().put(
        '/api/user',
        data: data,
      );
      
      _user = User.fromJson(response.data);
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  // 领取团队
  Future<bool> claimTeam() async {
    try {
      final response = await ApiService().post('/api/auth/claim-team');
      final success = response.data['success'];
      if (success) {
        _user = await _loadUser();
      }
      notifyListeners();
      return success;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  // ========== 主题相关 ==========
  
  bool _isDarkMode = false;
  bool get isDarkMode => _isDarkMode;

  // 切换主题
  void toggleTheme() {
    _isDarkMode = !_isDarkMode;
    notifyListeners();
  }

  // 设置主题
  void setTheme(bool isDark) {
    _isDarkMode = isDark;
    notifyListeners();
  }

  // 更新 Gateway 连接信息
  Future<Map<String, dynamic>?> fetchGatewayInfo() async {
    try {
      final response = await ApiService().get('/api/gateway/connect-info');
      final data = response.data;
      if (data['success'] == true && data['data'] != null) {
        return data['data'] as Map<String, dynamic>?;
      }
      return data;
    } catch (e) {
      debugPrint('Fetch gateway info error: $e');
      return null;
    }
  }

  // ========== 文件上传 ==========
  
  // 上传文件
  Future<Map<String, dynamic>?> uploadFile(String filePath, {String? agentId}) async {
    try {
      final apiService = ApiService();
      final uri = Uri.parse('${Constants.baseUrl}/api/files/upload');
      
      // 读取文件
      final file = File(filePath);
      final bytes = await file.readAsBytes();
      
      // 获取 MIME 类型
      final mimeType = _getMimeType(filePath);
      
      // 创建 multipart 请求
      final request = http.MultipartRequest('POST', uri)
        ..headers['Authorization'] = 'Bearer ${apiService.getAuthToken() ?? ''}'
        ..files.add(http.MultipartFile.fromBytes(
          'file',
          bytes,
          filename: file.path.split('/').last,
          contentType: mimeType != null ? MediaType('application', mimeType.split('/').last) : null,
        ))
        ..fields['agentId'] = agentId ?? 'default';
      
      final response = await request.send();
      final respStr = await response.stream.bytesToString();
      final data = json.decode(respStr);
      
      if (response.statusCode == 200 && data['success'] == true) {
        return data['data'] as Map<String, dynamic>?;
      }
      return null;
    } catch (e) {
      debugPrint('Upload file error: $e');
      return null;
    }
  }
  
  // 获取 MIME 类型
  String? _getMimeType(String filePath) {
    final extension = filePath.split('.').last.toLowerCase();
    final mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp',
      'txt': 'text/plain',
      'md': 'text/markdown',
      'json': 'application/json',
      'csv': 'text/csv',
      'xml': 'application/xml',
      'html': 'text/html',
      'pdf': 'application/pdf',
      'zip': 'application/zip',
      'rar': 'application/vnd.rar',
      '7z': 'application/x-7z-compressed',
      'tar': 'application/x-tar',
      'gz': 'application/gzip',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'mp4': 'video/mp4',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
    };
    return mimeTypes[extension];
  }

  // 签到
  Future<Map<String, dynamic>?> checkin() async {
    try {
      final response = await ApiService().post('/api/auth/checkin');
      return response.data;
    } catch (e) {
      debugPrint('Checkin error: $e');
      return null;
    }
  }

  // 获取签到状态
  Future<Map<String, dynamic>?> getCheckinStatus() async {
    try {
      final response = await ApiService().get('/api/auth/checkin/status');
      return response.data;
    } catch (e) {
      debugPrint('Get checkin status error: $e');
      return null;
    }
  }

  // ========== 订阅相关 API ==========
  
  // 获取当前订阅
  Future<Map<String, dynamic>?> getSubscription() async {
    try {
      final response = await ApiService().get('/api/subscription/current');
      final data = response.data;
      if (data['success'] == true) {
        return data['data'] as Map<String, dynamic>?;
      }
      return data;
    } catch (e) {
      debugPrint('Get subscription error: $e');
      return null;
    }
  }

  // 领取试用
  Future<Map<String, dynamic>?> claimTrial() async {
    try {
      final response = await ApiService().post('/api/subscription/trial');
      return response.data;
    } catch (e) {
      debugPrint('Claim trial error: $e');
      return null;
    }
  }

  // 订阅套餐
  Future<Map<String, dynamic>?> subscribePlan(String planId) async {
    try {
      final response = await ApiService().post(
        '/api/subscription/subscribe',
        data: {'planId': planId},
      );
      return response.data;
    } catch (e) {
      debugPrint('Subscribe plan error: $e');
      return null;
    }
  }

  // 购买积分包
  Future<Map<String, dynamic>?> buyCreditPack(String packId) async {
    try {
      final response = await ApiService().post(
        '/api/subscription/credit-pack',
        data: {'packId': packId},
      );
      return response.data;
    } catch (e) {
      debugPrint('Buy credit pack error: $e');
      return null;
    }
  }

  // ========== 技能相关 API ==========
  
  // 获取技能库
  Future<List<Map<String, dynamic>>> getSkillsLibrary() async {
    try {
      final response = await ApiService().get('/api/skills/library');
      final data = response.data;
      if (data['success'] == true && data['skills'] != null) {
        return List<Map<String, dynamic>>.from(data['skills']);
      }
      return [];
    } catch (e) {
      debugPrint('Get skills library error: $e');
      return [];
    }
  }

  // 获取已安装技能
  Future<List<Map<String, dynamic>>> getInstalledSkills() async {
    try {
      final response = await ApiService().get('/api/skills/installed');
      final data = response.data;
      if (data['skills'] != null) {
        return List<Map<String, dynamic>>.from(data['skills']);
      }
      return [];
    } catch (e) {
      debugPrint('Get installed skills error: $e');
      return [];
    }
  }

  // 安装技能
  Future<Map<String, dynamic>?> installSkill(String skillId) async {
    try {
      final response = await ApiService().post('/api/skills/install/$skillId');
      return response.data;
    } catch (e) {
      debugPrint('Install skill error: $e');
      return null;
    }
  }

  // 卸载技能
  Future<Map<String, dynamic>?> uninstallSkill(String skillId) async {
    try {
      final response = await ApiService().post('/api/skills/uninstall/$skillId');
      return response.data;
    } catch (e) {
      debugPrint('Uninstall skill error: $e');
      return null;
    }
  }

  // 清除错误
  void clearError() {
    _error = null;
    notifyListeners();
  }
}
