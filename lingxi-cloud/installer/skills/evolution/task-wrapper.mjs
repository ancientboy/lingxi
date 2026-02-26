/**
 * 任务包装模块
 * @module skills/evolution/task-wrapper
 * 
 * 职责：包装任务结果，自动评估并记录基因
 * 
 * 使用方式：
 * import { wrapTaskResult } from './skills/evolution/task-wrapper.mjs';
 * const result = await wrapTaskResult(task, solution, context);
 */

import { recordIfWorthy } from './recorder.mjs';

/**
 * 包装任务结果，自动评估并记录基因
 * 
 * @param {Object} task - 任务信息
 * @param {string} task.title - 任务标题
 * @param {string} task.description - 任务描述
 * @param {string} [task.type] - 任务类型
 * 
 * @param {Object} solution - 解决方案
 * @param {boolean} solution.success - 是否成功解决
 * @param {string} [solution.summary] - 解决方案摘要
 * @param {string[]} [solution.steps] - 解决步骤
 * @param {string[]} [solution.tools] - 使用的工具
 * @param {string[]} [solution.tips] - 注意事项
 * 
 * @param {Object} [context={}] - 上下文信息
 * @param {string} [context.agentId] - Agent ID
 * @param {string} [context.userId] - 用户 ID
 * @param {boolean} [context.userApproved] - 用户是否认可
 * @param {boolean} [context.silent=true] - 是否静默模式（不打印日志）
 * 
 * @returns {Promise<Object>} 包装后的结果
 * @returns {Object} returns.solution - 原始解决方案
 * @returns {Object|null} returns.gene - 记录的基因（如果有）
 * @returns {Object} returns.evaluation - 评估结果
 * @returns {string} returns.message - 提示信息
 */
export async function wrapTaskResult(task, solution, context = {}) {
  const { silent = true, ...recordContext } = context;
  
  // 保留原始解决方案
  const wrappedResult = {
    solution,
    gene: null,
    evaluation: null,
    message: ''
  };
  
  // 如果解决方案标记为不成功，跳过记录
  if (solution.success === false) {
    wrappedResult.message = '任务未成功完成，跳过基因记录';
    return wrappedResult;
  }
  
  try {
    // 调用记录模块
    const recordResult = await recordIfWorthy(task, solution, recordContext);
    
    wrappedResult.gene = recordResult.gene;
    wrappedResult.evaluation = recordResult.evaluation;
    wrappedResult.message = recordResult.message;
    
    // 非静默模式打印日志
    if (!silent && recordResult.gene) {
      console.log(`[Evolution] ${recordResult.message}`);
    }
  } catch (error) {
    // 静默失败，不影响主流程
    wrappedResult.message = `基因记录失败: ${error.message}`;
    
    if (!silent) {
      console.error('[Evolution] wrapTaskResult error:', error);
    }
  }
  
  return wrappedResult;
}

/**
 * 简化的任务完成包装器
 * 用于快速包装任务结果
 * 
 * @param {string} taskTitle - 任务标题
 * @param {string} taskDescription - 任务描述
 * @param {Object} solutionResult - 解决方案结果
 * @param {Object} [context={}] - 上下文
 * 
 * @returns {Promise<Object>}
 * 
 * @example
 * // 在 Agent 完成任务后调用
 * const result = await wrapSimpleTask(
 *   '修复登录页面 Bug',
 *   '用户登录时出现 500 错误',
 *   {
 *     success: true,
 *     summary: '修复了数据库连接问题',
 *     steps: ['检查日志', '发现连接池耗尽', '增加连接池大小'],
 *     tools: ['read', 'edit', 'exec']
 *   },
 *   { agentId: 'coder' }
 * );
 */
export async function wrapSimpleTask(taskTitle, taskDescription, solutionResult, context = {}) {
  const task = {
    title: taskTitle,
    description: taskDescription
  };
  
  const solution = {
    success: solutionResult.success !== false,
    summary: solutionResult.summary || solutionResult.message || '',
    steps: solutionResult.steps || [],
    tools: solutionResult.tools || [],
    tips: solutionResult.tips || [],
    tags: solutionResult.tags || []
  };
  
  return wrapTaskResult(task, solution, context);
}

/**
 * 创建可复用的任务包装器（带预设上下文）
 * 
 * @param {Object} defaultContext - 默认上下文
 * @returns {Function} 包装函数
 * 
 * @example
 * // 创建 Agent 专用的包装器
 * const wrapForCoder = createTaskWrapper({ agentId: 'coder' });
 * 
 * // 在任务完成后使用
 * const result = await wrapForCoder(task, solution);
 */
export function createTaskWrapper(defaultContext = {}) {
  return async (task, solution, extraContext = {}) => {
    const context = { ...defaultContext, ...extraContext };
    return wrapTaskResult(task, solution, context);
  };
}

export default {
  wrapTaskResult,
  wrapSimpleTask,
  createTaskWrapper
};
