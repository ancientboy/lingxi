/**
 * 统一 API 响应格式工具
 * 
 * 成功响应: { success: true, ...data }
 * 错误响应: { success: false, error: 'message' }
 */

/**
 * 成功响应
 * @param {Response} res - Express response 对象
 * @param {object} data - 返回的数据
 * @param {string} message - 可选的消息
 */
export function success(res, data = {}, message) {
  return res.json({
    success: true,
    ...(message && { message }),
    ...data
  });
}

/**
 * 错误响应
 * @param {Response} res - Express response 对象
 * @param {string} message - 错误消息
 * @param {number} code - HTTP 状态码（默认 500）
 */
export function error(res, message, code = 500) {
  return res.status(code).json({
    success: false,
    error: message
  });
}

/**
 * 常见错误快捷方法
 */
export const errors = {
  /** 400 Bad Request */
  badRequest: (res, message = '请求参数错误') => 
    error(res, message, 400),
  
  /** 401 Unauthorized */
  unauthorized: (res, message = '未授权，请先登录') => 
    error(res, message, 401),
  
  /** 403 Forbidden */
  forbidden: (res, message = '无权限访问') => 
    error(res, message, 403),
  
  /** 404 Not Found */
  notFound: (res, resource = '资源') => 
    error(res, `${resource}不存在`, 404),
  
  /** 500 Internal Server Error */
  serverError: (res, message = '服务器内部错误') => 
    error(res, message, 500)
};

export default {
  success,
  error,
  errors
};
