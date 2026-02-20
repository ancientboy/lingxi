/**
 * 测试脚本 - 测试统一记忆系统
 */

import { LocalMemoryAdapter } from './local-adapter.mjs';

async function test() {
  console.log('🧪 开始测试记忆系统...\n');

  // 创建本地适配器
  const adapter = new LocalMemoryAdapter({
    basePath: '/home/admin/.openclaw/memory'
  });

  console.log('1️⃣ 测试添加记忆...');
  const item1 = await adapter.add('用户喜欢用React开发前端', {
    domain: 'coding',
    type: 'preference',
    importance: 8,
    tags: ['react', 'frontend']
  });
  console.log('✅ 添加成功:', item1.id);

  const item2 = await adapter.add('用户晚上8-11点最活跃', {
    domain: 'business',
    type: 'pattern',
    importance: 7
  });
  console.log('✅ 添加成功:', item2.id);

  const item3 = await adapter.add('用户喜欢简洁的回答', {
    domain: 'personal',
    type: 'preference',
    importance: 9
  });
  console.log('✅ 添加成功:', item3.id);

  console.log('\n2️⃣ 测试搜索记忆...');
  const results = await adapter.search('React');
  console.log(`✅ 找到 ${results.length} 条记忆`);
  results.forEach(r => console.log(`   - ${r.content}`));

  console.log('\n3️⃣ 测试按领域获取...');
  const codingMemories = await adapter.getByDomain('coding');
  console.log(`✅ coding领域有 ${codingMemories.length} 条记忆`);

  console.log('\n4️⃣ 测试统计信息...');
  const stats = await adapter.getStats();
  console.log('✅ 统计信息:');
  console.log(`   总数: ${stats.total}`);
  console.log(`   按领域:`, stats.byDomain);
  console.log(`   按类型:`, stats.byType);

  console.log('\n🎉 测试完成！');
}

test().catch(console.error);
