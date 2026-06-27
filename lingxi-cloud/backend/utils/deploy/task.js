/**
 * 部署任务管理
 * 跟踪部署进度
 */

// 任务存储（生产环境应使用数据库）
const tasks = new Map();

/**
 * 创建任务
 */
export function createTask(taskId) {
  const task = {
    id: taskId,
    status: 'running',
    progress: 0,
    message: '初始化...',
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  tasks.set(taskId, task);
  return task;
}

/**
 * 更新任务
 */
export function updateTask(taskId, progress, message, status = 'running', result = null) {
  const task = tasks.get(taskId);
  
  if (!task) {
    console.warn(`任务不存在: ${taskId}`);
    return null;
  }
  
  task.progress = progress;
  task.message = message;
  task.status = status;
  task.result = result;
  task.updatedAt = new Date().toISOString();
  
  console.log(`📋 [${taskId}] ${progress}% - ${message}`);
  
  return task;
}

/**
 * 获取任务
 */
export function getTask(taskId) {
  return tasks.get(taskId) || null;
}

/**
 * 删除任务
 */
export function deleteTask(taskId) {
  return tasks.delete(taskId);
}

/**
 * 清理过期任务
 */
export function cleanupOldTasks(maxAge = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [taskId, task] of tasks.entries()) {
    const age = now - new Date(task.updatedAt).getTime();
    if (age > maxAge) {
      tasks.delete(taskId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 清理了 ${cleaned} 个过期任务`);
  }
  
  return cleaned;
}

// 每小时清理一次
setInterval(() => cleanupOldTasks(), 60 * 60 * 1000);

export default {
  createTask,
  updateTask,
  getTask,
  deleteTask,
  cleanupOldTasks
};
