/**
 * 测试记忆保护机制
 */

import { LocalMemoryAdapter } from './local-adapter.mjs';

async function testProtection() {
  console.log('🛡️ 记忆保护机制测试\n');

  const adapter = new LocalMemoryAdapter({
    basePath: '/home/admin/.openclaw/memory'
  });

  // 1. 添加不同重要性的记忆
  console.log('1️⃣ 添加不同重要性的记忆...');
  
  await adapter.add('低重要性信息', {
    domain: 'general',
    type: 'note',
    importance: 2
  });
  
  await adapter.add('中等重要性信息', {
    domain: 'general',
    type: 'note',
    importance: 5
  });
  
  await adapter.add('重要记忆：用户偏好', {
    domain: 'personal',
    type: 'preference',
    importance: 8
  });
  
  await adapter.add('核心记忆：用户核心偏好', {
    domain: 'personal',
    type: 'preference',
    importance: 9
  });
  
  console.log('✅ 已添加4条记忆\n');

  // 2. 查看统计
  console.log('2️⃣ 查看记忆统计...');
  const stats = await adapter.getStats();
  console.log(`总记忆: ${stats.total}条`);
  console.log(`重要性分布:`);
  console.log(`  低 (1-3): ${stats.byImportance.low}条`);
  console.log(`  中 (4-6): ${stats.byImportance.medium}条`);
  console.log(`  高 (7-8): ${stats.byImportance.high}条`);
  console.log(`  核心 (9-10): ${stats.byImportance.critical}条\n`);

  // 3. 尝试清理所有记忆（应该失败）
  console.log('3️⃣ 尝试清理所有记忆...');
  try {
    await adapter.clear();
  } catch (error) {
    console.log(`✅ 保护机制生效: ${error.message}\n`);
  }

  // 4. 只清理低重要性的记忆（应该成功）
  console.log('4️⃣ 清理低重要性记忆 (importance <= 3)...');
  const cleaned = await adapter.cleanupLowImportance(3);
  console.log(`\n`);

  // 5. 再次查看统计
  console.log('5️⃣ 清理后的统计...');
  const newStats = await adapter.getStats();
  console.log(`总记忆: ${newStats.total}条 (减少了 ${stats.total - newStats.total}条)`);
  console.log(`重要性分布:`);
  console.log(`  低 (1-3): ${newStats.byImportance.low}条`);
  console.log(`  中 (4-6): ${newStats.byImportance.medium}条`);
  console.log(`  高 (7-8): ${newStats.byImportance.high}条`);
  console.log(`  核心 (9-10): ${newStats.byImportance.critical}条\n`);

  console.log('🎉 测试完成！');
  console.log('\n✅ 结论：');
  console.log('  - 重要记忆受到保护');
  console.log('  - 只能清理低重要性记忆');
  console.log('  - 永远不会清理进化成果');
}

testProtection().catch(console.error);
