/**
 * 基因评估模块
 * @module skills/evolution/evaluator
 * 
 * 职责：评估解决方案是否值得记录为基因
 */

/**
 * 评估基因价值
 * @param {Object} task - 任务信息
 * @param {Object} solution - 解决方案
 * @returns {GeneEvaluation} - 评估结果 { score: 0-5, reasons: string[] }
 */
export function evaluateGene(task, solution) {
  let score = 0;
  const reasons = [];

  // 1. 成功解决问题 +2
  if (solution.success) {
    score += 2;
    reasons.push('成功解决问题');
  }

  // 2. 方法可复用 +1
  if (isReusable(solution)) {
    score += 1;
    reasons.push('方法可复用');
  }

  // 3. 通用性强（不依赖特定环境）+1
  if (!isEnvironmentSpecific(solution)) {
    score += 1;
    reasons.push('通用性强');
  }

  // 4. 用户明确认可 +1
  if (solution.userApproved || solution.explicitApproval) {
    score += 1;
    reasons.push('用户认可');
  }

  // 5. 解决方案复杂度适中 +0.5（太简单不值得记录，太复杂难以复用）
  const complexity = estimateComplexity(solution);
  if (complexity === 'medium') {
    score += 0.5;
    reasons.push('复杂度适中');
  }

  // 6. 涉及多步骤协作 +0.5
  if (hasMultipleSteps(solution)) {
    score += 0.5;
    reasons.push('多步骤协作');
  }

  // 7. 额外加成：首次发现（-1，避免记录常见模式）
  if (isCommonPattern(solution)) {
    score -= 1;
    reasons.push('常见模式，优先级降低');
  }

  // 确保分数在 0-5 范围内
  score = Math.max(0, Math.min(5, score));

  return {
    score,
    reasons,
    details: {
      success: solution.success,
      reusable: isReusable(solution),
      environmentSpecific: isEnvironmentSpecific(solution),
      userApproved: solution.userApproved || false,
      complexity,
      commonPattern: isCommonPattern(solution)
    }
  };
}

/**
 * 判断方法是否可复用
 * @param {Object} solution
 * @returns {boolean}
 */
function isReusable(solution) {
  // 如果有明确的步骤列表，说明可复用
  if (solution.steps && solution.steps.length > 1) {
    return true;
  }

  // 如果有策略描述，说明经过了抽象
  if (solution.strategy || solution.approach) {
    return true;
  }

  // 如果有模式或方法论
  if (solution.pattern || solution.methodology) {
    return true;
  }

  // 如果解决方案包含通用原则
  if (solution.principles && solution.principles.length > 0) {
    return true;
  }

  // 检查是否是一次性解决方案
  if (solution.oneTime || solution.disposable) {
    return false;
  }

  // 默认认为可复用
  return true;
}

/**
 * 判断是否依赖特定环境
 * @param {Object} solution
 * @returns {boolean}
 */
function isEnvironmentSpecific(solution) {
  // 如果明确标记为特定环境
  if (solution.environmentSpecific) {
    return true;
  }

  // 检查是否包含特定路径
  if (solution.paths || solution.absolutePaths) {
    const pathPatterns = [
      /\/Users\//,
      /\/home\/\w+\//,
      /C:\\Users\\/,
      /\/var\/www\/\w+\//,
      /192\.168\.\d+\.\d+/,
      /localhost/,
      /127\.0\.0\.1/
    ];

    const paths = solution.paths || [];
    for (const path of paths) {
      for (const pattern of pathPatterns) {
        if (pattern.test(path)) {
          return true;
        }
      }
    }
  }

  // 检查是否包含特定凭证
  if (solution.credentials || solution.apiKeys || solution.tokens) {
    return true;
  }

  // 检查是否依赖特定用户
  if (solution.userId && solution.userId !== 'current') {
    return true;
  }

  return false;
}

/**
 * 评估复杂度
 * @param {Object} solution
 * @returns {'low' | 'medium' | 'high'}
 */
function estimateComplexity(solution) {
  // 计算复杂度分数
  let complexityScore = 0;

  // 步骤数量
  const stepCount = solution.steps?.length || 0;
  if (stepCount > 5) complexityScore += 2;
  else if (stepCount > 2) complexityScore += 1;

  // 涉及的工具数量
  const toolCount = solution.tools?.length || 0;
  if (toolCount > 3) complexityScore += 1;

  // 代码行数（如果有）
  if (solution.codeLines) {
    if (solution.codeLines > 100) complexityScore += 2;
    else if (solution.codeLines > 20) complexityScore += 1;
  }

  // 时间成本
  if (solution.duration) {
    if (solution.duration > 30 * 60 * 1000) complexityScore += 1; // 超过30分钟
  }

  // 判断复杂度级别
  if (complexityScore >= 4) return 'high';
  if (complexityScore >= 1) return 'medium';
  return 'low';
}

/**
 * 判断是否有多个步骤
 * @param {Object} solution
 * @returns {boolean}
 */
function hasMultipleSteps(solution) {
  const steps = solution.steps || solution.actions || [];
  return steps.length > 1;
}

/**
 * 判断是否为常见模式（不值得特别记录）
 * @param {Object} solution
 * @returns {boolean}
 */
function isCommonPattern(solution) {
  const commonPatterns = [
    // 非常基础的命令
    /^(ls|cd|cat|echo|grep|find)\s+/,
    // 简单的安装命令
    /^(npm install|pip install|apt-get install)/,
    // 简单的 Git 操作
    /^(git add|git commit|git push)/,
    // 简单的文件操作
    /^(mkdir|rmdir|rm|cp|mv)\s+/
  ];

  // 检查命令是否匹配常见模式
  if (solution.commands) {
    for (const cmd of solution.commands) {
      for (const pattern of commonPatterns) {
        if (pattern.test(cmd)) {
          return true;
        }
      }
    }
  }

  // 如果明确标记为常见模式
  if (solution.common || solution.basic) {
    return true;
  }

  return false;
}

/**
 * 从解决方案中提取基因名称
 * @param {Object} solution
 * @returns {string}
 */
export function extractName(solution) {
  // 优先使用解决方案提供的名称
  if (solution.geneName) {
    return solution.geneName;
  }

  // 使用策略描述
  if (solution.strategy?.description) {
    return summarizeText(solution.strategy.description, 15);
  }

  // 使用方法描述
  if (solution.approach) {
    return summarizeText(solution.approach, 15);
  }

  // 使用摘要
  if (solution.summary) {
    return summarizeText(solution.summary, 15);
  }

  // 默认名称
  return '未命名策略';
}

/**
 * 从解决方案中提取步骤
 * @param {Object} solution
 * @returns {string[]}
 */
export function extractSteps(solution) {
  // 优先使用已有的步骤
  if (solution.steps && solution.steps.length > 0) {
    return solution.steps.map((step, index) => {
      if (typeof step === 'string') {
        // 如果步骤没有编号，添加编号
        if (!/^\d+[.、)）]/.test(step)) {
          return `${index + 1}. ${step}`;
        }
        return step;
      }
      return `${index + 1}. ${step.description || step}`;
    });
  }

  // 从动作列表提取
  if (solution.actions && solution.actions.length > 0) {
    return solution.actions.map((action, index) => {
      return `${index + 1}. ${action.description || action}`;
    });
  }

  // 从日志提取
  if (solution.log && solution.log.length > 0) {
    // 提取关键步骤
    const keySteps = solution.log
      .filter(entry => entry.type === 'step' || entry.important)
      .map(entry => entry.message || entry);
    
    if (keySteps.length > 0) {
      return keySteps.map((step, index) => `${index + 1}. ${step}`);
    }
  }

  // 默认步骤
  return ['1. 执行解决方案'];
}

/**
 * 摘要文本
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function summarizeText(text, maxLength) {
  if (!text) return '';
  
  // 移除多余空白
  text = text.trim().replace(/\s+/g, ' ');
  
  // 截断
  if (text.length <= maxLength) {
    return text;
  }
  
  // 尝试在句子边界截断
  const lastPeriod = text.lastIndexOf('。', maxLength);
  const lastComma = text.lastIndexOf('，', maxLength);
  const cutPoint = Math.max(lastPeriod, lastComma, maxLength - 3);
  
  return text.substring(0, cutPoint) + '...';
}

/**
 * 从任务推断基因分类
 * @param {Object} task
 * @returns {GeneCategory}
 */
export function inferCategory(task) {
  // 优先使用任务指定的分类
  if (task.category) {
    return task.category;
  }

  // 从任务类型推断
  const taskType = task.type?.toLowerCase() || '';
  
  if (taskType.includes('debug') || taskType.includes('bug') || taskType.includes('error')) {
    return 'debug';
  }
  
  if (taskType.includes('write') || taskType.includes('doc') || taskType.includes('article')) {
    return 'writing';
  }
  
  if (taskType.includes('analyze') || taskType.includes('data') || taskType.includes('report')) {
    return 'analysis';
  }
  
  if (taskType.includes('plan') || taskType.includes('schedule') || taskType.includes('organize')) {
    return 'planning';
  }
  
  if (taskType.includes('tool') || taskType.includes('command') || taskType.includes('cli')) {
    return 'tool';
  }

  // 从任务描述推断
  const description = (task.description || '').toLowerCase();
  
  if (/debug|bug|错误|异常|问题|排错/.test(description)) {
    return 'debug';
  }
  
  if (/code|编码|编程|开发|实现/.test(description)) {
    return 'coding';
  }
  
  if (/write|写作|文档|文章/.test(description)) {
    return 'writing';
  }
  
  if (/analyze|分析|统计|数据/.test(description)) {
    return 'analysis';
  }
  
  if (/plan|计划|规划|安排/.test(description)) {
    return 'planning';
  }

  // 默认分类
  return 'coding';
}

/**
 * 生成摘要描述
 * @param {Object} solution
 * @returns {string}
 */
export function summarize(solution) {
  if (solution.strategy?.description) {
    return solution.strategy.description;
  }
  
  if (solution.approach) {
    return solution.approach;
  }
  
  if (solution.summary) {
    return solution.summary;
  }
  
  // 根据步骤生成描述
  const steps = extractSteps(solution);
  if (steps.length > 0) {
    return `通过 ${steps.length} 个步骤解决问题`;
  }
  
  return '解决问题的通用方法';
}

export default {
  evaluateGene,
  extractName,
  extractSteps,
  inferCategory,
  summarize
};
