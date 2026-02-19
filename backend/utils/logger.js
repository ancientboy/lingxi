/**
 * 灵犀云日志工具
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const levels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const colors = {
  debug: '\x1b[36m',  // cyan
  info: '\x1b[32m',   // green
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
  reset: '\x1b[0m',
};

function formatTime() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function log(level, ...args) {
  if (levels[level] >= levels[LOG_LEVEL]) {
    const prefix = `${colors[level]}[${formatTime()}] [${level.toUpperCase()}]${colors.reset}`;
    console.log(prefix, ...args);
  }
}

export const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
  
  // 便捷方法
  success: (...args) => log('info', '✅', ...args),
  fail: (...args) => log('error', '❌', ...args),
  progress: (...args) => log('info', '🔄', ...args),
};

export default logger;
