import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:lingxicloud/utils/constants.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  final Dio _dio = Dio(BaseOptions(
    baseUrl: Constants.baseUrl,
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 30),
  ));
  
  String? _token;

  // 设置认证头
  void setAuthToken(String token) {
    _token = token;
    if (token.isNotEmpty) {
      _dio.options.headers['Authorization'] = 'Bearer $token';
    } else {
      _dio.options.headers.remove('Authorization');
    }
  }

  // 获取认证头
  String? getAuthToken() => _token;

  // 清除认证头
  void clearAuthToken() {
    _token = null;
    _dio.options.headers.remove('Authorization');
  }

  // GET 请求
  Future<Response> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await _dio.get(
        path,
        queryParameters: queryParameters,
      );
      return response;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // POST 请求
  Future<Response> post(
    String path, {
    Map<String, dynamic>? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await _dio.post(
        path,
        data: data,
        queryParameters: queryParameters,
      );
      return response;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // PUT 请求
  Future<Response> put(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    try {
      final response = await _dio.put(
        path,
        data: data,
      );
      return response;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // DELETE 请求
  Future<Response> delete(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    try {
      final response = await _dio.delete(
        path,
        data: data,
      );
      return response;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // 错误处理
  Exception _handleError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return Exception('请求超时，请检查网络连接');
      case DioExceptionType.badResponse:
        final statusCode = e.response?.statusCode;
        final data = e.response?.data;
        
        if (statusCode == 401) {
          return Exception('未授权，请重新登录');
        } else if (statusCode == 403) {
          return Exception('禁止访问');
        } else if (statusCode == 404) {
          return Exception('请求的资源不存在');
        } else if (statusCode == 500) {
          return Exception('服务器错误');
        }
        
        if (data != null && data is Map) {
          return Exception(data['message'] ?? '请求失败');
        }
        return Exception('请求失败');
      case DioExceptionType.cancel:
        return Exception('请求已取消');
      default:
        return Exception('网络错误: ${e.message}');
    }
  }
  
  // ============ 使用量统计 ============
  
  // 获取使用量统计
  Future<Map<String, dynamic>?> getUsageStats() async {
    try {
      final response = await get('/api/usage/stats');
      final data = response.data;
      debugPrint('📊 使用量统计 API 响应: $data');
      if (data is Map && data['success'] == true && data['data'] != null) {
        return data['data'] as Map<String, dynamic>;
      }
      if (data is Map) {
        debugPrint('⚠️ 使用量统计 API 返回失败: ${data['error'] ?? '未知错误'}');
      }
      return null;
    } catch (e) {
      debugPrint('❌ 使用量统计 API 调用异常: $e');
      return null;
    }
  }
  
  // ============ Agent 管理 ============
  
  Future<bool> updateMyAgents(String userId, List<String> agents) async {
    try {
      final response = await post('/api/agents/user/$userId', data: {'agents': agents});
      return response.data['success'] == true;
    } catch (e) {
      return false;
    }
  }
  
  // 修改密码
  Future<Map<String, dynamic>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      final response = await post('/api/auth/change-password', data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      });
      return response.data;
    } catch (e) {
      throw Exception('修改密码失败: ${e.toString()}');
    }
  }
  
  Future<List<Map<String, dynamic>>> getAvailableAgents() async {
    try {
      final response = await get('/api/agents/available');
      final data = response.data;
      if (data['success'] == true && data['agents'] != null) {
        return List<Map<String, dynamic>>.from(data['agents']);
      }
      return [];
    } catch (e) {
      return [];
    }
  }
}
