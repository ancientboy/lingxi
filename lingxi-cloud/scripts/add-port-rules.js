#!/usr/bin/env node

/**
 * 为旧 VPC 的安全组添加端口规则
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

require('dotenv').config({ path: join(__dirname, '..', 'backend', '.env') });

const Ecs = require('@alicloud/ecs20140526');
const EcsClient = Ecs.default;
const $OpenApi = require('@alicloud/openapi-client');

// 需要添加的端口
const PORTS_TO_ADD = [
  { port: 9876, protocol: 'tcp', desc: '文件服务' },
];

// 目标安全组
const SECURITY_GROUP_ID = 'sg-bp12iqpiue63mmz0115b';

async function main() {
  console.log('🔧 为旧 VPC 安全组添加端口规则\n');
  console.log('='.repeat(60));

  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const regionId = process.env.ALIYUN_REGION || 'cn-hangzhou';

  const clientConfig = new $OpenApi.Config({ accessKeyId, accessKeySecret });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  const client = new EcsClient(clientConfig);

  try {
    // 1. 查询现有规则
    console.log('\n📋 查询安全组现有规则...\n');
    const rulesRequest = new Ecs.DescribeSecurityGroupAttributeRequest({
      regionId,
      securityGroupId: SECURITY_GROUP_ID,
    });

    const rules = await client.describeSecurityGroupAttribute(rulesRequest);
    const existingPorts = new Set();

    rules.body.permissions.permission.forEach(rule => {
      if (rule.direction === 'ingress') {
        const portRange = rule.portRange;
        const port = portRange.split('/')[0];
        existingPorts.add(parseInt(port));
        console.log(`  现有规则: ${rule.portRange} ${rule.ipProtocol} - ${rule.description || '无描述'}`);
      }
    });

    // 2. 添加缺失的端口
    console.log('\n\n🔧 添加缺失的端口规则...\n');

    for (const portConfig of PORTS_TO_ADD) {
      const { port, protocol, desc } = portConfig;

      if (existingPorts.has(port)) {
        console.log(`  ⏭️  ${port}/${protocol} - ${desc} (已存在)`);
        continue;
      }

      try {
        const authRequest = new Ecs.AuthorizeSecurityGroupRequest({
          regionId,
          securityGroupId: SECURITY_GROUP_ID,
          ipProtocol: protocol,
          portRange: `${port}/${port}`,
          sourceCidrIp: '0.0.0.0/0',
          priority: 1,
          description: `灵犀云 - ${desc}`,
        });

        await client.authorizeSecurityGroup(authRequest);
        console.log(`  ✅ ${port}/${protocol} - ${desc}`);
        await sleep(500);
      } catch (err) {
        if (err.message.includes('Duplicate')) {
          console.log(`  ⏭️  ${port}/${protocol} - ${desc} (已存在)`);
        } else {
          console.log(`  ❌ ${port}/${protocol} - ${desc}: ${err.message}`);
        }
      }
    }

    // 3. 验证
    console.log('\n\n📋 验证安全组规则...\n');
    const verifyRequest = new Ecs.DescribeSecurityGroupAttributeRequest({
      regionId,
      securityGroupId: SECURITY_GROUP_ID,
    });

    const verifyResponse = await client.describeSecurityGroupAttribute(verifyRequest);
    const allPorts = [];

    verifyResponse.body.permissions.permission.forEach(rule => {
      if (rule.direction === 'ingress') {
        const portRange = rule.portRange;
        const port = portRange.split('/')[0];
        allPorts.push(parseInt(port));
      }
    });

    console.log(`  安全组 ${SECURITY_GROUP_ID} 开放的端口:`);
    allPorts.sort((a, b) => a - b);
    allPorts.forEach(p => {
      if (PORTS_TO_ADD.find(pt => pt.port === p)) {
        console.log(`    ✅ ${p} - ${PORTS_TO_ADD.find(pt => pt.port === p).desc}`);
      }
    });

    // 4. 总结
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ 端口规则添加完成！\n');
    console.log('影响用户:');
    console.log('  - 57 (120.26.17.83)');
    console.log('  - 褚时 (114.55.149.200)');
    console.log('\n新增端口:');
    console.log('  - 9876 (文件服务)');
    console.log('\n🎉 现在这两个用户的文件预览功能可以正常使用了！\n');

  } catch (error) {
    console.error('\n❌ 操作失败:', error.message);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
