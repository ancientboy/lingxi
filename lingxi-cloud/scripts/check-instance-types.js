#!/usr/bin/env node

/**
 * 查询阿里云可用的实例规格
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

async function main() {
  console.log('🔍 查询阿里云实例规格\n');
  console.log('='.repeat(60));

  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const regionId = process.env.ALIYUN_REGION || 'cn-hangzhou';
  const zoneId = process.env.ALIYUN_ZONE || 'cn-hangzhou-h';

  const clientConfig = new $OpenApi.Config({ accessKeyId, accessKeySecret });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  const client = new EcsClient(clientConfig);

  try {
    // 1. 查询按量付费规格
    console.log('\n📋 按量付费实例规格:\n');
    const request1 = new Ecs.DescribeAvailableResourceRequest({
      regionId,
      zoneId,
      destinationResource: 'InstanceType',
      instanceChargeType: 'PostPaid',
    });

    const response1 = await client.describeAvailableResource(request1);
    const types1 = response1.body.availableZones.availableZone[0].availableResources.availableResource;

    // 筛选 2vCPU 2GiB 的规格
    const targetSpecs = types1.filter(t => t.cpuCoreCount === 2 && t.memorySize === 2);
    
    if (targetSpecs.length > 0) {
      console.log('  2 vCPU, 2 GiB 内存规格:\n');
      targetSpecs.forEach(t => {
        console.log(`  - ${t.type}`);
        console.log(`    CPU: ${t.cpuCoreCount} 核`);
        console.log(`    内存: ${t.memorySize} GB`);
        console.log('');
      });
    }

    // 2. 查询包年包月规格
    console.log('\n📋 包年包月实例规格:\n');
    const request2 = new Ecs.DescribeAvailableResourceRequest({
      regionId,
      zoneId,
      destinationResource: 'InstanceType',
      instanceChargeType: 'PrePaid',
    });

    const response2 = await client.describeAvailableResource(request2);
    const types2 = response2.body.availableZones.availableZone[0].availableResources.availableResource;

    // 筛选 2vCPU 2GiB 的规格
    const targetSpecs2 = types2.filter(t => t.cpuCoreCount === 2 && t.memorySize === 2);
    
    if (targetSpecs2.length > 0) {
      console.log('  2 vCPU, 2 GiB 内存规格:\n');
      targetSpecs2.forEach(t => {
        console.log(`  - ${t.type}`);
        console.log(`    CPU: ${t.cpuCoreCount} 核`);
        console.log(`    内存: ${t.memorySize} GB`);
        console.log('');
      });
    }

    // 3. 查询当前使用的规格信息
    console.log('\n📋 当前配置的实例规格:\n');
    const currentType = process.env.ALIYUN_INSTANCE_TYPE || 'ecs.t5-c1m2.large';
    console.log(`  规格: ${currentType}`);
    
    // 查找这个规格的详细信息
    const currentInfo = types1.find(t => t.type === currentType);
    if (currentInfo) {
      console.log(`  CPU: ${currentInfo.cpuCoreCount} 核`);
      console.log(`  内存: ${currentInfo.memorySize} GB`);
    }

    // 4. 查询价格
    console.log('\n💰 价格查询（需要手动在控制台查看）:\n');
    console.log('  经济型 e 系列: ecs.e-c1m2.large');
    console.log('  突发性能型 t5: ecs.t5-c1m2.large');
    console.log('  通用型 g6: ecs.g6.large (2vCPU 8GiB)');
    console.log('\n  建议: 在阿里云控制台创建实例页面查看实时价格');

    // 5. 建议
    console.log('\n' + '='.repeat(60));
    console.log('\n💡 分析和建议:\n');
    console.log('  用户提到的配置:');
    console.log('    - 2 vCPU, 2 GiB');
    console.log('    - 经济型 e');
    console.log('    - ESSD Entry 40GiB');
    console.log('    - 3 Mbps 带宽');
    console.log('    - 包年包月');
    console.log('');
    console.log('  当前使用的配置:');
    console.log(`    - 规格: ${currentType}`);
    console.log('    - 带宽: 1 Mbps');
    console.log('    - 付费类型: 按量付费');
    console.log('');
    console.log('  🎯 建议:');
    console.log('    1. 包年包月比按量付费更便宜（长期使用）');
    console.log('    2. 经济型 e 比突发性能型 t5 更稳定');
    console.log('    3. 3 Mbps 带宽更适合文件预览和下载');
    console.log('    4. 如果用户长期使用，建议改为包年包月');
    console.log('');
    console.log('  ⚠️  注意:');
    console.log('    - 包年包月需要预付费');
    console.log('    - 按量付费更灵活，适合测试');
    console.log('    - 需要根据用户付费模式调整部署策略');

  } catch (error) {
    console.error('\n❌ 查询失败:', error.message);
  }
}

main();
