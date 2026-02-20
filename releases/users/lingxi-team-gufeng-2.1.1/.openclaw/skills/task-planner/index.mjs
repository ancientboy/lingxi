/**
 * 智能任务拆解规划器
 *
 * 功能：
 * - 将大目标拆解成小任务
 * - 智能安排到日程
 * - 追踪进度
 */

import fs from 'fs';
import path from 'path';

const PLANS_FILE = '/home/admin/.openclaw/workspace/memory/plans.json';

// 加载计划
function loadPlans() {
  try {
    if (fs.existsSync(PLANS_FILE)) {
      return JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

// 保存计划
function savePlans(plans) {
  const dir = path.dirname(PLANS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2));
}

/**
 * 创建计划
 * @param {string} goal - 目标
 * @param {object} options - { deadline, hoursPerWeek, tags, stages }
 * @returns {object} 计划对象
 */
export function createPlan(goal, options = {}) {
  const {
    deadline = null,
    hoursPerWeek = 10,
    tags = [],
    stages = []
  } = options;

  const plan = {
    id: `plan_${Date.now()}`,
    goal,
    deadline,
    hoursPerWeek,
    tags,
    stages: stages || [],
    createdAt: new Date().toISOString(),
    progress: 0,
    status: 'active'
  };

  const plans = loadPlans();
  plans.push(plan);
  savePlans(plans);

  return plan;
}

/**
 * 查看计划
 * @param {string} planId - 计划 ID
 * @returns {object|null}
 */
export function showPlan(planId) {
  const plans = loadPlans();
  return plans.find(p => p.id === planId) || null;
}

/**
 * 列出所有计划
 * @returns {array}
 */
export function listPlans() {
  return loadPlans();
}

/**
 * 更新计划
 * @param {string} planId - 计划 ID
 * @param {object} updates - 更新内容
 */
export function updatePlan(planId, updates) {
  const plans = loadPlans();
  const index = plans.findIndex(p => p.id === planId);

  if (index === -1) {
    throw new Error('Plan not found');
  }

  plans[index] = { ...plans[index], ...updates };
  savePlans(plans);

  return plans[index];
}

/**
 * 添加阶段
 * @param {string} planId - 计划 ID
 * @param {object} stage - 阶段对象
 */
export function addStage(planId, stage) {
  const plans = loadPlans();
  const plan = plans.find(p => p.id === planId);

  if (!plan) {
    throw new Error('Plan not found');
  }

  plan.stages.push({
    id: `stage_${Date.now()}`,
    ...stage,
    completed: false
  });

  savePlans(plans);
  return plan;
}

/**
 * 添加任务到阶段
 * @param {string} planId - 计划 ID
 * @param {string} stageId - 阶段 ID
 * @param {object} task - 任务对象
 */
export function addTaskToStage(planId, stageId, task) {
  const plans = loadPlans();
  const plan = plans.find(p => p.id === planId);

  if (!plan) {
    throw new Error('Plan not found');
  }

  const stage = plan.stages.find(s => s.id === stageId);
  if (!stage) {
    throw new Error('Stage not found');
  }

  if (!stage.tasks) {
    stage.tasks = [];
  }

  stage.tasks.push({
    id: `task_${Date.now()}`,
    ...task,
    completed: false,
    completedAt: null
  });

  savePlans(plans);
  return plan;
}

/**
 * 完成任务
 * @param {string} planId - 计划 ID
 * @param {string} taskId - 任务 ID
 */
export function completeTask(planId, taskId) {
  const plans = loadPlans();
  const plan = plans.find(p => p.id === planId);

  if (!plan) {
    throw new Error('Plan not found');
  }

  let found = false;
  for (const stage of plan.stages) {
    if (stage.tasks) {
      const task = stage.tasks.find(t => t.id === taskId);
      if (task) {
        task.completed = true;
        task.completedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
  }

  if (!found) {
    throw new Error('Task not found');
  }

  // 更新进度
  plan.progress = calculateProgress(plan);

  // 检查阶段是否完成
  for (const stage of plan.stages) {
    if (stage.tasks && stage.tasks.every(t => t.completed)) {
      stage.completed = true;
    }
  }

  // 检查计划是否完成
  if (plan.stages.every(s => s.completed)) {
    plan.status = 'completed';
  }

  savePlans(plans);
  return plan;
}

/**
 * 计算进度
 * @param {object} plan - 计划对象
 * @returns {number} 进度百分比
 */
function calculateProgress(plan) {
  let totalTasks = 0;
  let completedTasks = 0;

  for (const stage of plan.stages) {
    if (stage.tasks) {
      totalTasks += stage.tasks.length;
      completedTasks += stage.tasks.filter(t => t.completed).length;
    }
  }

  return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
}

/**
 * 追踪进度
 * @param {string} planId - 计划 ID
 * @returns {object} 进度信息
 */
export function trackProgress(planId) {
  const plan = showPlan(planId);
  if (!plan) {
    throw new Error('Plan not found');
  }

  const progress = {
    goal: plan.goal,
    totalProgress: plan.progress,
    stages: []
  };

  for (const stage of plan.stages) {
    const stageProgress = {
      name: stage.name,
      completed: stage.completed,
      tasks: stage.tasks ? stage.tasks.length : 0,
      completedTasks: stage.tasks ? stage.tasks.filter(t => t.completed).length : 0
    };

    if (stage.tasks && stage.tasks.length > 0) {
      stageProgress.percentage = Math.round((stageProgress.completedTasks / stageProgress.tasks) * 100);
    }

    progress.stages.push(stageProgress);
  }

  return progress;
}

/**
 * 同步到 tasks 技能
 * @param {string} planId - 计划 ID
 * @param {object} tasks - tasks 技能实例
 */
export async function syncToTasks(planId, tasks) {
  const plan = showPlan(planId);
  if (!plan) {
    throw new Error('Plan not found');
  }

  const syncedTasks = [];

  for (const stage of plan.stages) {
    if (stage.tasks) {
      for (const task of stage.tasks) {
        if (!task.completed && !task.syncedToTasks) {
          // 调用 tasks.add
          const taskData = {
            title: `${plan.goal} - ${stage.name}: ${task.title}`,
            tags: plan.tags,
            note: `来自计划: ${plan.goal}`,
            planId,
            stageId: stage.id,
            taskId: task.id
          };

          if (task.time) {
            taskData.time = task.time;
          }

          if (task.duration) {
            taskData.duration = task.duration;
          }

          if (task.priority) {
            taskData.priority = task.priority;
          }

          // await tasks.add(taskData.title, taskData);
          syncedTasks.push(taskData);

          // 标记已同步
          task.syncedToTasks = true;
        }
      }
    }
  }

  savePlans(loadPlans());
  return syncedTasks;
}

/**
 * 生成计划报告
 * @param {string} planId - 计划 ID
 * @returns {string} Markdown 报告
 */
export function generateReport(planId) {
  const plan = showPlan(planId);
  if (!plan) {
    throw new Error('Plan not found');
  }

  let report = `# ${plan.goal}\n\n`;
  report += `**进度:** ${plan.progress}%\n`;
  report += `**状态:** ${plan.status}\n`;
  report += `**创建时间:** ${plan.createdAt}\n`;

  if (plan.deadline) {
    report += `**截止日期:** ${plan.deadline}\n`;
  }

  report += `\n---\n\n`;

  for (const stage of plan.stages) {
    const emoji = stage.completed ? '✅' : '⏳';
    report += `## ${emoji} ${stage.name}\n\n`;

    if (stage.duration) {
      report += `**预计时长:** ${stage.duration}\n\n`;
    }

    if (stage.tasks && stage.tasks.length > 0) {
      for (const task of stage.tasks) {
        const taskEmoji = task.completed ? '✅' : '⬜';
        report += `- ${taskEmoji} ${task.title}`;

        if (task.hours) {
          report += ` (${task.hours}h)`;
        }

        if (task.completedAt) {
          report += ` - 完成于 ${new Date(task.completedAt).toLocaleDateString()}`;
        }

        report += `\n`;
      }
      report += `\n`;
    }
  }

  return report;
}

export default {
  createPlan,
  showPlan,
  listPlans,
  updatePlan,
  addStage,
  addTaskToStage,
  completeTask,
  trackProgress,
  syncToTasks,
  generateReport
};
