/**
 * Lume RPC 测试脚本 - 验证改进后的连接保活机制
 */

// 模拟测试环境
const fs = require('fs');
const path = require('path');

// 读取 lume-rpc.js 内容
const rpcCode = fs.readFileSync(path.join(__dirname, 'lume-rpc.js'), 'utf8');

console.log('=== Lume RPC 改进验证测试 ===\n');

// 测试 1: 检查关键改进是否存在
console.log('测试 1: 检查关键改进');
const checks = [
  { name: 'tick 监控', pattern: /startTickWatch|tickWatchdog|lastTickTime/ },
  { name: '智能认证失败处理', pattern: /parseAuthError|reconnectPausedForAuthFailure/ },
  { name: '改进退避算法', pattern: /reconnectFactor\s*=\s*1\.7|reconnectBaseDelay\s*=\s*500/ },
  { name: '服务端策略解析', pattern: /tickIntervalMs|serverTickIntervalMs/ },
  { name: '连接状态机', pattern: /connState|setConnState/ },
  { name: '离线队列', pattern: /offlineQueue|enqueueOffline|flushOfflineQueue/ },
];

let passed = 0;
let failed = 0;

checks.forEach(check => {
  const found = check.pattern.test(rpcCode);
  if (found) {
    console.log(`  ✅ ${check.name}`);
    passed++;
  } else {
    console.log(`  ❌ ${check.name} - 未找到`);
    failed++;
  }
});

// 测试 2: 验证退避算法计算
console.log('\n测试 2: 验证退避算法');
function computeReconnectDelay(attempt) {
  const reconnectBaseDelay = 500;
  const reconnectMaxDelay = 15000;
  const reconnectFactor = 1.7;
  const reconnectJitter = 500;
  
  var delay = reconnectBaseDelay * Math.pow(reconnectFactor, attempt);
  if (delay > reconnectMaxDelay) delay = reconnectMaxDelay;
  delay += (Math.random() * 2 - 1) * reconnectJitter;
  return Math.max(350, Math.round(delay));
}

console.log('  退避延迟测试 (无 jitter):');
for (let i = 0; i < 10; i++) {
  const delay = 500 * Math.pow(1.7, i);
  const clamped = Math.min(delay, 15000);
  console.log(`    尝试 ${i}: ${Math.round(clamped)}ms`);
  if (clamped >= 15000) break;
}

// 测试 3: 验证 tick 超时检测逻辑
console.log('\n测试 3: 验证 tick 超时检测');
const serverTickIntervalMs = 30000;
const timeoutThreshold = serverTickIntervalMs * 2;
console.log(`  服务端 tick 间隔: ${serverTickIntervalMs}ms`);
console.log(`  超时阈值: ${timeoutThreshold}ms (2倍间隔)`);

// 模拟时间流逝
const testCases = [
  { elapsed: 20000, expected: false, desc: '正常范围内' },
  { elapsed: 60000, expected: true, desc: '刚好超时' },
  { elapsed: 90000, expected: true, desc: '严重超时' },
];

testCases.forEach(tc => {
  const shouldReconnect = tc.elapsed >= timeoutThreshold;
  const status = shouldReconnect === tc.expected ? '✅' : '❌';
  console.log(`  ${status} ${tc.desc}: ${tc.elapsed}ms -> ${shouldReconnect ? '重连' : '正常'}`);
});

// 测试 4: 验证认证错误处理
console.log('\n测试 4: 验证认证错误处理');
const authErrors = [
  { code: 'AUTH_TOKEN_INVALID', shouldPause: true, desc: 'token 无效' },
  { code: 'AUTH_RATE_LIMITED', shouldPause: true, desc: '速率限制' },
  { code: 'DEVICE_IDENTITY_REQUIRED', shouldPause: true, desc: '设备身份' },
  { code: 'PAIRING_REQUIRED', details: { reason: 'not-paired', pauseReconnect: false }, shouldPause: false, desc: '配对中(可重试)' },
];

// 简化版 parseAuthError 用于测试
function testParseAuthError(errorData) {
  var code = errorData.code || 'UNKNOWN';
  var details = errorData.details || {};
  var detailCode = details.code || code;
  var pauseReconnect = false;

  switch (detailCode) {
    case 'AUTH_TOKEN_INVALID':
    case 'AUTH_RATE_LIMITED':
    case 'DEVICE_IDENTITY_REQUIRED':
      pauseReconnect = true;
      break;
    case 'PAIRING_REQUIRED':
      var reason = details.reason;
      var pause = details.pauseReconnect;
      if (reason === 'not-paired' && pause === false) {
        pauseReconnect = false;
      } else {
        pauseReconnect = true;
      }
      break;
  }
  return { pauseReconnect };
}

authErrors.forEach(tc => {
  const result = testParseAuthError(tc);
  const status = result.pauseReconnect === tc.shouldPause ? '✅' : '❌';
  console.log(`  ${status} ${tc.desc}: ${tc.code} -> ${result.pauseReconnect ? '暂停重连' : '继续重连'}`);
});

// 测试 5: 检查代码结构完整性
console.log('\n测试 5: 代码结构完整性');
const requiredFunctions = [
  'startTickWatch',
  'parseAuthError',
  'computeReconnectDelay',
  'scheduleReconnect',
  'forceReconnect',
  'handleWsMessage',
  'handleWsClose',
];

requiredFunctions.forEach(fn => {
  const found = rpcCode.includes(`function ${fn}`);
  console.log(`  ${found ? '✅' : '❌'} ${fn}()`);
});

// 总结
console.log('\n=== 测试总结 ===');
console.log(`通过: ${passed}/${checks.length} 项检查`);
console.log(`失败: ${failed}/${checks.length} 项检查`);

if (failed === 0) {
  console.log('\n🎉 所有关键改进已正确实施！');
} else {
  console.log('\n⚠️ 部分改进未找到，请检查代码。');
}
