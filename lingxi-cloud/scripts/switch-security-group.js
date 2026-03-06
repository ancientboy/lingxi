#!/usr/bin/env node

/**
 * 切换用户服务器的安全组到标准安全组
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

// 要切换的实例
const INSTANCES = [
  { name: '57', instanceId: 'i-bp1abqv5dbxuwxr8lzyv', ip: '120.26.17.83' },
  { name: '褚时', instanceId: 'i-bp188n2ksvk06l6nh2p8', ip: '114.55.149.200' },
];

// 目标安全组
const TARGET_SG = 'sg-bp175bcj1jn10tbtxba8';

async function main() {
  console.log('🔄 切换用户服务器安全组\n');
  console.log('='.repeat(60));

  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const regionId = process.env.ALIYUN_REGION || 'cn-hangzhou';

  const clientConfig = new $OpenApi.Config({ accessKeyId, accessKeySecret });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  const client = new EcsClient(clientConfig);

  try {
    for (const instance of INSTANCES) {
      console.log(`\n👤 ${instance.name} (${instance.ip})`);
      console.log(`   实例 ID: ${instance.instanceId}`);

      // 1. 查询当前安全组
      console.log('\n   📋 查询当前安全组...');
      const describeRequest = new Ecs.DescribeInstancesRequest({
        regionId,
        instanceIds: JSON.stringify([instance.instanceId]),
      });

      const response = await client.describeInstances(describeRequest);
      const instanceInfo = response.body.instances.instance[0];

      if (!instanceInfo) {
        console.log('   ❌ 实例不存在');
        continue;
      }

      const currentSGs = instanceInfo.securityGroupIds.securityGroupId;
      console.log(`   当前安全组: ${currentSGs.join(', ')}`);

      // 2. 切换安全组
      console.log(`\n   🔄 切换到标准安全组: ${TARGET_SG}...`);

      try {
        const modifyRequest = new Ecs.ModifyInstanceAttributeRequest({
          regionId,
          instanceId: instance.instanceId,
          securityGroupIds: [TARGET_SG],
        });

        await client.modifyInstanceAttribute(modifyRequest);
        console.log('   ✅ 安全组已切换');

        // 3. 验证
        await sleep(3000);
        const verifyRequest = new Ecs.DescribeInstancesRequest({
          regionId,
          instanceIds: JSON.stringify([instance.instanceId]),
        });

        const verifyResponse = await client.describeInstances(verifyRequest);
        const verifyInfo = verifyResponse.body.instances.instance[0];
        const newSGs = verifyInfo.securityGroupIds.securityGroupId;

        console.log(`   验证安全组: ${newSGs.join(', ')}`);

        if (newSGs.includes(TARGET_SG)) {
          console.log('   ✅ 验证成功！');
        } else {
          console.log('   ⚠️ 验证失败，请手动检查');
        }

      } catch (error) {
        console.log(`   ❌ 切换失败: ${error.message}`);
      }
    }

    // 4. 总结
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 切换结果:\n');
    console.log('  标准安全组 ID: sg-bp175bcj1jn10tbtxba8');
    console.log('\n  已配置的端口:');
    console.log('    - 22 (SSH)');
    console.log('    - 80 (HTTP)');
    console.log('    - 443 (HTTPS)');
    console.log('    - 3000 (灵犀云前端)');
    console.log('    - 9876 (文件服务)');
    console.log('    - 18789 (OpenClaw Gateway)');
    console.log('    - 8080, 8000 (备用 HTTP)');
    console.log('\n✨ 所有端口都已预配置，无需手动添加！\n');

  } catch (error) {
    console.error('\n❌ 操作失败:', error.message);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
