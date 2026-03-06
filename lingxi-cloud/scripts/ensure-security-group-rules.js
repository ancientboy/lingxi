/**
 * 确保安全组规则完整
 * 用于检查并添加缺失的端口规则
 */

import { config } from '../backend/config/index.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ecs = require('@alicloud/ecs20140526');
const $OpenApi = require('@alicloud/openapi-client');

const REQUIRED_PORTS = [
  { port: 22, desc: 'SSH' },
  { port: 80, desc: 'HTTP' },
  { port: 443, desc: 'HTTPS' },
  { port: 3000, desc: '灵犀云后端' },
  { port: 8000, desc: '备用 HTTP' },
  { port: 8080, desc: '备用 HTTP' },
  { port: 9876, desc: '文件预览服务' },
  { port: 13000, desc: '灵犀云备用' },
  { port: 17860, desc: '其他服务' },
  { port: 18789, desc: 'OpenClaw Gateway' },
  { port: 18790, desc: 'OpenClaw 备用' },
  { port: 18791, desc: 'OpenClaw 备用' },
  { port: 18792, desc: 'OpenClaw 备用' }
];

async function main() {
  const client = createEcsClient();
  const sgId = config.aliyun.securityGroupId;
  const regionId = config.aliyun.region;

  console.log('========================================');
  console.log('🔒 检查安全组规则');
  console.log('========================================\n');
  console.log(`安全组 ID: ${sgId}`);
  console.log(`区域: ${regionId}\n`);

  // 1. 获取现有规则
  console.log('📋 现有规则：');
  let existingPorts = [];
  
  try {
    const result = await client.describeSecurityGroupAttribute({
      regionId: regionId,
      securityGroupId: sgId,
      direction: 'ingress'
    });

    const permissions = result.body.permissions.permission;
    existingPorts = permissions
      .filter(p => p.sourceCidrIp === '0.0.0.0/0' && p.ipProtocol === 'TCP')
      .map(p => parseInt(p.portRange.split('/')[0]));

    console.log(`   已开放端口 (公网): ${existingPorts.sort((a,b) => a-b).join(', ')}\n`);
  } catch (e) {
    console.error('   ❌ 获取规则失败:', e.message);
    return;
  }

  // 2. 检查并添加缺失的端口
  console.log('🔧 检查缺失端口：');
  const missingPorts = REQUIRED_PORTS.filter(p => !existingPorts.includes(p.port));

  if (missingPorts.length === 0) {
    console.log('   ✅ 所有端口都已开放！\n');
  } else {
    console.log(`   发现 ${missingPorts.length} 个缺失端口：${missingPorts.map(p => p.port).join(', ')}\n`);

    for (const rule of missingPorts) {
      try {
        await client.authorizeSecurityGroup({
          regionId: regionId,
          securityGroupId: sgId,
          ipProtocol: 'TCP',
          portRange: `${rule.port}/${rule.port}`,
          sourceCidrIp: '0.0.0.0/0',
          description: rule.desc
        });
        console.log(`   ✅ 已开放端口 ${rule.port} (${rule.desc})`);
      } catch (e) {
        if (e.message.includes('already exist') || e.message.includes('Duplicate')) {
          console.log(`   ⚠️ 端口 ${rule.port} 已存在`);
        } else {
          console.log(`   ❌ 端口 ${rule.port} 添加失败: ${e.message}`);
        }
      }
    }
    console.log('');
  }

  // 3. 输出最终状态
  console.log('========================================');
  console.log('✅ 安全组规则检查完成！');
  console.log('========================================');
  console.log('\n📋 灵犀云用户服务器端口配置：\n');
  console.log('| 端口 | 用途 |');
  console.log('|------|------|');
  for (const p of REQUIRED_PORTS) {
    console.log(`| ${p.port} | ${p.desc} |`);
  }
  console.log('\n💡 新创建的用户服务器将自动应用这些规则！\n');
}

function createEcsClient() {
  const clientConfig = new $OpenApi.Config({
    accessKeyId: config.aliyun.accessKeyId,
    accessKeySecret: config.aliyun.accessKeySecret,
  });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  clientConfig.readTimeout = 60000;
  clientConfig.connectTimeout = 30000;
  return new Ecs.default(clientConfig);
}

main().catch(console.error);
