#!/usr/bin/env node

/**
 * 灵犀云 - 阿里云安全组配置脚本
 * 
 * 功能：
 * 1. 创建标准安全组（如果不存在）
 * 2. 添加所有必需端口规则
 * 3. 输出安全组 ID 供 .env 配置使用
 * 
 * 使用方法：
 * node scripts/setup-security-group.js
 */

import { createRequire } from 'module';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载环境变量
config({ path: join(__dirname, '..', 'backend', '.env') });

const Ecs = require('@alicloud/ecs20140526');
const EcsClient = Ecs.default;
const $OpenApi = require('@alicloud/openapi-client');

// 标准端口配置
const STANDARD_PORTS = [
  { port: 22, protocol: 'tcp', desc: 'SSH', required: true },
  { port: 80, protocol: 'tcp', desc: 'HTTP', required: false },
  { port: 443, protocol: 'tcp', desc: 'HTTPS', required: false },
  { port: 3000, protocol: 'tcp', desc: '灵犀云前端', required: true },
  { port: 8080, protocol: 'tcp', desc: '备用 HTTP', required: false },
  { port: 8000, protocol: 'tcp', desc: '备用 HTTP', required: false },
  { port: 9876, protocol: 'tcp', desc: '文件服务', required: true },
  { port: 18789, protocol: 'tcp', desc: 'OpenClaw Gateway', required: true },
];

async function main() {
  console.log('🚀 灵犀云安全组配置工具\n');

  // 检查环境变量
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const regionId = process.env.ALIYUN_REGION || 'cn-hangzhou';
  const vpcId = process.env.ALIYUN_VPC_ID;

  if (!accessKeyId || !accessKeySecret) {
    console.error('❌ 缺少阿里云凭证');
    console.error('请在 backend/.env 中配置:');
    console.error('  ALIYUN_ACCESS_KEY_ID=xxx');
    console.error('  ALIYUN_ACCESS_KEY_SECRET=xxx');
    process.exit(1);
  }

  if (!vpcId) {
    console.error('❌ 缺少 VPC ID');
    console.error('请在 backend/.env 中配置:');
    console.error('  ALIYUN_VPC_ID=vpc-xxxxxx');
    process.exit(1);
  }

  console.log('✅ 环境变量检查通过');
  console.log(`   区域: ${regionId}`);
  console.log(`   VPC: ${vpcId}\n`);

  // 创建 ECS 客户端
  const clientConfig = new $OpenApi.Config({
    accessKeyId,
    accessKeySecret,
  });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  const client = new EcsClient(clientConfig);

  try {
    // 1. 检查是否已存在灵犀云安全组
    console.log('🔍 检查现有安全组...');
    const describeRequest = new Ecs.DescribeSecurityGroupsRequest({
      regionId,
      vpcId,
    });
    
    const existingGroups = await client.describeSecurityGroups(describeRequest);
    const lingxiGroup = existingGroups.body.securityGroups.securityGroup.find(
      sg => sg.securityGroupName === 'lingxi-cloud-standard'
    );

    let securityGroupId;

    if (lingxiGroup) {
      securityGroupId = lingxiGroup.securityGroupId;
      console.log(`✅ 找到现有安全组: ${securityGroupId}\n`);
    } else {
      // 2. 创建安全组
      console.log('📦 创建新安全组...');
      const createRequest = new Ecs.CreateSecurityGroupRequest({
        regionId,
        securityGroupName: 'lingxi-cloud-standard',
        description: '灵犀云标准安全组配置 - 自动创建',
        vpcId,
      });

      const createResponse = await client.createSecurityGroup(createRequest);
      securityGroupId = createResponse.body.securityGroupId;
      console.log(`✅ 安全组已创建: ${securityGroupId}\n`);

      // 等待安全组创建完成
      await sleep(3000);
    }

    // 3. 添加端口规则
    console.log('🔧 配置端口规则...\n');
    
    for (const portConfig of STANDARD_PORTS) {
      const { port, protocol, desc, required } = portConfig;
      
      try {
        const authRequest = new Ecs.AuthorizeSecurityGroupRequest({
          regionId,
          securityGroupId,
          ipProtocol: protocol,
          portRange: `${port}/${port}`,
          sourceCidrIp: '0.0.0.0/0',
          priority: 1,
          description: `灵犀云 - ${desc}`,
        });

        await client.authorizeSecurityGroup(authRequest);
        console.log(`   ✅ ${port}/${protocol} - ${desc} ${required ? '(必需)' : '(可选)'}`);
      } catch (err) {
        if (err.message.includes('Duplicate')) {
          console.log(`   ⏭️  ${port}/${protocol} - ${desc} (已存在)`);
        } else {
          console.error(`   ❌ ${port}/${protocol} - ${desc}: ${err.message}`);
        }
      }
    }

    // 4. 输出配置信息
    console.log('\n🎉 安全组配置完成！\n');
    console.log('='.repeat(60));
    console.log('📋 配置信息');
    console.log('='.repeat(60));
    console.log(`安全组 ID: ${securityGroupId}`);
    console.log(`安全组名称: lingxi-cloud-standard`);
    console.log(`区域: ${regionId}`);
    console.log(`VPC ID: ${vpcId}`);
    console.log('='.repeat(60));
    console.log('\n📝 请将以下配置添加到 backend/.env 文件中:\n');
    console.log(`ALIYUN_SECURITY_GROUP_ID=${securityGroupId}`);
    console.log('\n然后重启灵犀云服务:');
    console.log('  pm2 restart lingxi-cloud');
    console.log('\n');

    // 5. 列出所有规则
    console.log('📊 当前安全组规则:\n');
    const rulesRequest = new Ecs.DescribeSecurityGroupAttributeRequest({
      regionId,
      securityGroupId,
    });
    
    const rules = await client.describeSecurityGroupAttribute(rulesRequest);
    console.log('入方向规则:');
    rules.body.permissions.permission.forEach(rule => {
      console.log(`  ${rule.portRange} ${rule.ipProtocol} - ${rule.description || '无描述'}`);
    });

  } catch (error) {
    console.error('\n❌ 配置失败:', error.message);
    console.error('\n请检查:');
    console.error('  1. 阿里云 AccessKey 是否正确');
    console.error('  2. VPC ID 是否存在');
    console.error('  3. 是否有足够的权限');
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
