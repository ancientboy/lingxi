#!/usr/bin/env node

/**
 * 灵犀云 - 配置检查工具
 * 
 * 检查阿里云配置是否完整，输出缺失的配置项
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载环境变量（从 backend/node_modules 加载 dotenv）
require('dotenv').config({ path: join(__dirname, '..', 'backend', '.env') });

const REQUIRED_CONFIG = {
  '基础配置': [
    { key: 'USER_SERVER_PASSWORD', desc: '用户服务器 SSH 密码', example: 'Lingxi@2026!' },
    { key: 'ZHIPU_API_KEY', desc: '智谱 AI API Key', example: 'xxx.xxx' },
    { key: 'DASHSCOPE_API_KEY', desc: '阿里云 DashScope API Key', example: 'sk-xxx' },
  ],
  '阿里云配置（一键部署需要）': [
    { key: 'ALIYUN_ACCESS_KEY_ID', desc: '阿里云 AccessKey ID', example: 'LTAI5tFwob255ZynLRpQB628' },
    { key: 'ALIYUN_ACCESS_KEY_SECRET', desc: '阿里云 AccessKey Secret', example: 'xxx' },
    { key: 'ALIYUN_REGION', desc: '地域', example: 'cn-hangzhou', default: 'cn-hangzhou' },
    { key: 'ALIYUN_ZONE', desc: '可用区', example: 'cn-hangzhou-h', default: 'cn-hangzhou-h' },
    { key: 'ALIYUN_VPC_ID', desc: 'VPC ID', example: 'vpc-xxxxxx' },
    { key: 'ALIYUN_VSWITCH_ID', desc: '交换机 ID', example: 'vsw-xxxxxx' },
    { key: 'ALIYUN_SECURITY_GROUP_ID', desc: '安全组 ID', example: 'sg-xxxxxx' },
  ],
  '可选配置': [
    { key: 'ALIYUN_INSTANCE_TYPE', desc: '实例规格', example: 'ecs.g6.large', default: 'ecs.t5-c1m2.large' },
    { key: 'ALIYUN_DISK_SIZE', desc: '系统盘大小 (GB)', example: '40', default: '40' },
    { key: 'ALIYUN_BANDWIDTH', desc: '公网带宽 (Mbps)', example: '5', default: '5' },
    { key: 'ALIYUN_CUSTOM_IMAGE_ID', desc: '自定义镜像 ID', example: 'm-xxxxxx' },
  ],
};

console.log('🔍 灵犀云配置检查\n');
console.log('='.repeat(60));

let hasErrors = false;
let hasWarnings = false;

for (const [category, configs] of Object.entries(REQUIRED_CONFIG)) {
  console.log(`\n📋 ${category}\n`);
  
  for (const { key, desc, example, default: defaultValue } of configs) {
    const value = process.env[key];
    const isRequired = category !== '可选配置';
    
    if (value) {
      // 隐藏敏感信息
      const displayValue = key.includes('KEY') || key.includes('SECRET') || key.includes('PASSWORD')
        ? '***' + value.slice(-4)
        : value;
      console.log(`  ✅ ${key}`);
      console.log(`     ${desc}: ${displayValue}`);
    } else if (defaultValue) {
      console.log(`  ⚠️  ${key} (使用默认值)`);
      console.log(`     ${desc}: ${defaultValue}`);
      hasWarnings = true;
    } else if (isRequired) {
      console.log(`  ❌ ${key} (缺失)`);
      console.log(`     ${desc}`);
      console.log(`     示例: ${example}`);
      hasErrors = true;
    } else {
      console.log(`  ⏭️  ${key} (可选)`);
      console.log(`     ${desc}`);
    }
  }
}

console.log('\n' + '='.repeat(60));

if (hasErrors) {
  console.log('\n❌ 配置不完整，请补充缺失的配置项');
  console.log('\n📝 配置步骤:');
  console.log('  1. 复制配置模板:');
  console.log('     cp backend/.env.example backend/.env');
  console.log('  2. 编辑配置文件:');
  console.log('     vim backend/.env');
  console.log('  3. 重新运行检查:');
  console.log('     node scripts/check-aliyun-config.js');
  console.log('\n💡 提示:');
  console.log('  - VPC、交换机、安全组需要在阿里云控制台预先创建');
  console.log('  - 或运行自动配置脚本:');
  console.log('    node scripts/setup-security-group.js');
  process.exit(1);
} else if (hasWarnings) {
  console.log('\n⚠️  配置基本完整，但有一些可选项使用默认值');
  console.log('   建议检查默认值是否符合需求');
  process.exit(0);
} else {
  console.log('\n✅ 配置完整！');
  console.log('\n🚀 可以开始使用一键部署功能了');
  process.exit(0);
}
