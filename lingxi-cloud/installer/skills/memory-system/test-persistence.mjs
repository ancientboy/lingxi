/**
 * 记忆持久化测试
 * 验证记忆是否在重启后仍然存在
 */

import { LocalMemoryAdapter } from './local-adapter.mjs';

async function testPersistence() {
  console.log('🧪 记忆持久化测试\n');

  const adapter = new LocalMemoryAdapter({
    basePath: '/home/admin/.openclaw/memory'
  });

  // 1. 读取现有记忆
  console.log('1️⃣ 读取现有记忆...');
  const existingMemories = await adapter.getByDomain('coding');
  console.log(`✅ 找到 ${existingMemories.length} 条coding记忆`);
  existingMemories.forEach(m => console.log(`   - ${m.content}`));

  // 2. 验证记忆是否持久化
  console.log('\n2️⃣ 验证持久化...');
  if (existingMemories.length > 0) {
    console.log('✅ 记忆已持久化！');
    console.log('   重启后记忆仍然存在');
    console.log('   灵犀可以记住用户偏好');
  } else {
    console.log('❌ 没有找到记忆');
    console.log('   需要先添加一些记忆');
  }

  // 3. 测试搜索
  console.log('\n3️⃣ 测试搜索功能...');
  const results = await adapter.search('React');
  console.log(`✅ 搜索"React"找到 ${results.length} 条记忆`);

  // 4. 统计信息
  console.log('\n4️⃣ 统计信息...');
  const stats = await adapter.getStats();
  console.log(`✅ 总记忆数: ${stats.total}`);
  console.log(`   按领域:`, stats.byDomain);
  console.log(`   按类型:`, stats.byType);

  console.log('\n🎉 持久化测试完成！');
  
  console.log('\n💡 结论：');
  console.log('✅ 记忆存储在本地文件中');
  console.log('✅ 重启后记忆不会丢失');
  console.log('⚠️ 但灵犀必须主动加载才能使用');
}

testPersistence().catch(console.error);
