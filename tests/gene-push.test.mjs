/**
 * 基因推送测试脚本
 * 
 * 测试内容：
 * 1. 平台能否推送基因
 * 2. 实例能否收到推送
 * 
 * 使用方法：
 * node tests/gene-push.test.mjs
 */

import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.LINGXI_CLOUD_URL || 'http://localhost:3000';
const API_TOKEN = process.env.LINGXI_CLOUD_TOKEN || '';

// ANSI 颜色
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, ...args) {
  console.log(colors[color], ...args, colors.reset);
}

function assert(condition, message) {
  if (condition) {
    log('green', '✓', message);
    return true;
  } else {
    log('red', '✗', message);
    return false;
  }
}

// ============ 测试用例 ============

async function testHealth() {
  log('blue', '\n[测试 1] 健康检查');
  
  try {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    
    assert(res.ok, 'API 服务可访问');
    assert(data.status === 'ok', 'API 健康状态正常');
    
    return res.ok;
  } catch (err) {
    log('red', '✗ 健康检查失败:', err.message);
    return false;
  }
}

async function testGetPlatformGenes() {
  log('blue', '\n[测试 2] 获取平台基因');
  
  if (!API_TOKEN) {
    log('yellow', '! 跳过: 未配置 API_TOKEN');
    return null;
  }
  
  try {
    const res = await fetch(`${API_URL}/api/genes/platform`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    const data = await res.json();
    
    if (!res.ok) {
      log('red', '✗ 获取失败:', data.error);
      return false;
    }
    
    assert(Array.isArray(data.genes), '返回基因列表');
    log('green', `  找到 ${data.genes.length} 个平台基因`);
    
    return data.genes;
  } catch (err) {
    log('red', '✗ 获取失败:', err.message);
    return false;
  }
}

async function testPushToAllUsers(geneIds) {
  log('blue', '\n[测试 3] 推送基因给所有用户');
  
  if (!API_TOKEN) {
    log('yellow', '! 跳过: 未配置 API_TOKEN');
    return null;
  }
  
  if (!geneIds || geneIds.length === 0) {
    log('yellow', '! 跳过: 没有可推送的基因');
    return null;
  }
  
  // 只推送第一个基因作为测试
  const testGeneIds = geneIds.slice(0, 1);
  
  try {
    const res = await fetch(`${API_URL}/api/genes/admin/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`
      },
      body: JSON.stringify({
        geneIds: testGeneIds,
        message: '[测试推送] 这是一条测试消息'
      })
    });
    const data = await res.json();
    
    if (!res.ok) {
      // 如果是 404 可能是没有在线用户，这是正常的
      if (data.error?.includes('未找到')) {
        log('yellow', '! 未找到指定基因 (可能基因ID不正确)');
        return null;
      }
      log('red', '✗ 推送失败:', data.error);
      return false;
    }
    
    assert(data.success, '推送请求成功');
    assert(typeof data.pushed === 'number', '返回推送数量');
    
    log('green', `  推送给 ${data.pushed} 个在线用户`);
    if (data.genes) {
      log('green', `  推送了 ${data.genes} 个基因`);
    }
    
    return data;
  } catch (err) {
    log('red', '✗ 推送失败:', err.message);
    return false;
  }
}

async function testPushToUser(geneIds, userId) {
  log('blue', '\n[测试 4] 推送基因给指定用户');
  
  if (!API_TOKEN) {
    log('yellow', '! 跳过: 未配置 API_TOKEN');
    return null;
  }
  
  if (!geneIds || geneIds.length === 0) {
    log('yellow', '! 跳过: 没有可推送的基因');
    return null;
  }
  
  if (!userId) {
    log('yellow', '! 跳过: 未指定用户ID');
    return null;
  }
  
  const testGeneIds = geneIds.slice(0, 1);
  
  try {
    const res = await fetch(`${API_URL}/api/genes/admin/push/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`
      },
      body: JSON.stringify({
        geneIds: testGeneIds,
        message: '[测试推送] 推送给指定用户'
      })
    });
    const data = await res.json();
    
    if (!res.ok) {
      if (data.error?.includes('不在线') || data.error?.includes('没有运行')) {
        log('yellow', '! 用户不在线 (这是正常的)');
        return null;
      }
      log('red', '✗ 推送失败:', data.error);
      return false;
    }
    
    assert(data.success, '推送请求成功');
    assert(data.userId === userId, '推送给正确的用户');
    
    return data;
  } catch (err) {
    log('red', '✗ 推送失败:', err.message);
    return false;
  }
}

async function testPushHistory() {
  log('blue', '\n[测试 5] 获取推送历史');
  
  if (!API_TOKEN) {
    log('yellow', '! 跳过: 未配置 API_TOKEN');
    return null;
  }
  
  try {
    const res = await fetch(`${API_URL}/api/genes/admin/push/history`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    const data = await res.json();
    
    if (!res.ok) {
      log('red', '✗ 获取失败:', data.error);
      return false;
    }
    
    assert(data.success, '获取历史成功');
    assert(Array.isArray(data.history), '返回历史列表');
    
    log('green', `  找到 ${data.total} 条推送记录`);
    if (data.history.length > 0) {
      const latest = data.history[0];
      log('blue', `  最近推送: ${latest.geneNames?.join(', ')} @ ${latest.pushedAt}`);
    }
    
    return data;
  } catch (err) {
    log('red', '✗ 获取失败:', err.message);
    return false;
  }
}

// ============ 本地模块测试 ============

async function testLocalPusherModule() {
  log('blue', '\n[测试 6] 本地推送模块');
  
  try {
    // 动态导入本地模块
    const pusher = await import('/home/admin/.openclaw/workspace/skills/evolution/pusher.mjs');
    
    assert(typeof pusher.pushGenesToUsers === 'function', 'pushGenesToUsers 函数存在');
    assert(typeof pusher.pushGeneToUser === 'function', 'pushGeneToUser 函数存在');
    assert(typeof pusher.pushGeneToInstance === 'function', 'pushGeneToInstance 函数存在');
    assert(typeof pusher.getPushHistory === 'function', 'getPushHistory 函数存在');
    
    return true;
  } catch (err) {
    log('red', '✗ 模块加载失败:', err.message);
    return false;
  }
}

// ============ 主程序 ============

async function main() {
  console.log('\n========================================');
  console.log('       基因推送系统测试');
  console.log('========================================');
  
  log('blue', 'API URL:', API_URL);
  log('blue', 'Token:', API_TOKEN ? '已配置' : '未配置');
  
  const results = [];
  
  // 运行测试
  results.push(['健康检查', await testHealth()]);
  
  const genes = await testGetPlatformGenes();
  results.push(['获取平台基因', genes !== false]);
  
  const geneIds = genes ? genes.map(g => g.id) : [];
  const pushResult = await testPushToAllUsers(geneIds);
  results.push(['推送给所有用户', pushResult !== false]);
  
  // 如果有命令行参数作为 userId，测试推送给指定用户
  const testUserId = process.argv[2];
  if (testUserId) {
    const userResult = await testPushToUser(geneIds, testUserId);
    results.push(['推送给指定用户', userResult !== false]);
  }
  
  results.push(['获取推送历史', await testPushHistory() !== false]);
  results.push(['本地推送模块', await testLocalPusherModule()]);
  
  // 汇总
  console.log('\n========================================');
  console.log('       测试结果汇总');
  console.log('========================================');
  
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const [name, result] of results) {
    if (result === null) {
      skipped++;
      log('yellow', `⊘ ${name} (跳过)`);
    } else if (result) {
      passed++;
      log('green', `✓ ${name}`);
    } else {
      failed++;
      log('red', `✗ ${name}`);
    }
  }
  
  console.log('\n----------------------------------------');
  log('green', `通过: ${passed}`);
  if (failed > 0) log('red', `失败: ${failed}`);
  if (skipped > 0) log('yellow', `跳过: ${skipped}`);
  console.log('----------------------------------------\n');
  
  // 退出码
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
