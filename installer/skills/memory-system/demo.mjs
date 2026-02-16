/**
 * 记忆系统使用示例
 */

import { 
  initMemory, 
  loadDomainMemories, 
  rememberFeedback,
  rememberPreference,
  quickSearch,
  getUserProfile,
  learn
} from './lingxi-integration.mjs';

async function demo() {
  console.log('🚀 灵犀记忆系统演示\n');

  // 1. 初始化
  console.log('1️⃣ 初始化记忆系统...');
  await initMemory();
  
  // 2. 记住用户偏好
  console.log('\n2️⃣ 记住用户偏好...');
  await rememberPreference('用户喜欢简洁的回答', 'personal');
  await rememberPreference('用户喜欢用React开发前端', 'coding');
  await rememberPreference('用户晚上8-11点最活跃', 'business');
  
  // 3. 从反馈中学习
  console.log('\n3️⃣ 从反馈中学习...');
  await rememberFeedback('这次代码实现很优雅', {
    domain: 'coding',
    importance: 8,
    context: '防抖函数'
  });
  
  // 4. 学习新知识
  console.log('\n4️⃣ 学习新知识...');
  await learn('用户正在学习AI，目标是做产品', 'business');
  
  // 5. 切换思维模式时加载记忆
  console.log('\n5️⃣ 切换到云溪思维，加载coding记忆...');
  const codingMemories = await loadDomainMemories('coding');
  console.log('加载的记忆:');
  codingMemories.forEach(m => console.log(`  - ${m.content}`));
  
  // 6. 快速搜索
  console.log('\n6️⃣ 快速搜索"React"...');
  const results = await quickSearch('React', 'coding');
  console.log(`找到 ${results.length} 条相关记忆`);
  
  // 7. 获取用户画像
  console.log('\n7️⃣ 获取用户画像...');
  const profile = await getUserProfile();
  console.log('用户偏好:');
  profile.preferences.forEach(p => console.log(`  - ${p}`));
  
  console.log('\n✅ 演示完成！');
}

demo().catch(console.error);
