#!/usr/bin/env node

/**
 * 灵犀云 - 安全组规则检查和配置工具
 * 
 * 功能：
 * 1. 检查指定安全组的规则
 * 2. 添加缺失的端口规则
 * 3. 输出完整的配置信息
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载环境变量
require('dotenv').config({ path: join(__dirname, '..', 'backend', '.env') });

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
  console.log('🔧 灵犀云安全组配置工具\n');
  console.log('='.repeat(60));

  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const regionId = process.env.ALIYUN_REGION || 'cn-hangzhou';

  if (!accessKeyId || !accessKeySecret) {
    console.error('❌ 缺少阿里云凭证');
    process.exit(1);
  }

  // 创建客户端
  const clientConfig = new $OpenApi.Config({ accessKeyId, accessKeySecret });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  const client = new EcsClient(clientConfig);

  try {
    // 1. 查询所有安全组
    console.log('\n🔍 查询安全组...\n');
    const sgRequest = new Ecs.DescribeSecurityGroupsRequest({ regionId });
    const sgs = await client.describeSecurityGroups(sgRequest);

    // 2. 让用户选择安全组
    console.log('可用的安全组:\n');
    sgs.body.securityGroups.securityGroup.forEach((sg, index) => {
      console.log(`  ${index + 1}. ${sg.securityGroupName || '未命名'} (${sg.securityGroupId})`);
      console.log(`     VPC: ${sg.vpcId || '经典网络'}`);
      console.log('');
    });

    // 使用 sg-20260218 (lingxi VPC 的安全组)
    const targetSg = sgs.body.securityGroups.securityGroup.find(
      sg => sg.securityGroupId === 'sg-bp175bcj1jn10tbtxba8'
    );

    if (!targetSg) {
      console.error('❌ 未找到目标安全组');
      process.exit(1);
    }

    console.log(`\n✅ 使用安全组: ${targetSg.securityGroupName} (${targetSg.securityGroupId})\n`);

    // 3. 查询现有规则
    console.log('📋 现有入方向规则:\n');
    const rulesRequest = new Ecs.DescribeSecurityGroupAttributeRequest({
      regionId,
      securityGroupId: targetSg.securityGroupId,
    });
    
    const rules = await client.describeSecurityGroupAttribute(rulesRequest);
    const existingPorts = new Set();
    
    rules.body.permissions.permission.forEach(rule => {
      if (rule.direction === 'ingress') {
        const portRange = rule.portRange;
        const port = portRange.split('/')[0];
        existingPorts.add(parseInt(port));
        console.log(`  ${rule.portRange} ${rule.ipProtocol} - ${rule.description || '无描述'}`);
      }
    });

    // 4. 检查缺失的端口
    console.log('\n🔍 检查缺失的端口...\n');
    const missingPorts = STANDARD_PORTS.filter(p => !existingPorts.has(p.port));

    if (missingPorts.length === 0) {
      console.log('  ✅ 所有必需端口都已配置！');
    } else {
      console.log('  ⚠️  以下端口需要添加:\n');
      missingPorts.forEach(p => {
        console.log(`     ${p.port}/${p.protocol} - ${p.desc} ${p.required ? '(必需)' : '(可选)'}`);
      });

      // 5. 添加缺失的端口规则
      console.log('\n🔧 开始添加端口规则...\n');
      
      for (const portConfig of missingPorts) {
        const { port, protocol, desc, required } = portConfig;
        
        try {
          const authRequest = new Ecs.AuthorizeSecurityGroupRequest({
            regionId,
            securityGroupId: targetSg.securityGroupId,
            ipProtocol: protocol,
            portRange: `${port}/${port}`,
            sourceCidrIp: '0.0.0.0/0',
            priority: 1,
            description: `灵犀云 - ${desc}`,
          });

          await client.authorizeSecurityGroup(authRequest);
          console.log(`  ✅ ${port}/${protocol} - ${desc}`);
          
          // 等待一下，避免请求过快
          await sleep(500);
        } catch (err) {
          if (err.message.includes('Duplicate')) {
            console.log(`  ⏭️  ${port}/${protocol} - ${desc} (已存在)`);
          } else {
            console.error(`  ❌ ${port}/${protocol} - ${desc}: ${err.message}`);
          }
        }
      }
    }

    // 6. 查找对应的 VPC 和交换机
    console.log('\n\n📋 关联的 VPC 信息:\n');
    const vpcId = targetSg.vpcId;
    
    const vswRequest = new Ecs.DescribeVSwitchesRequest({ regionId });
    const vsws = await client.describeVSwitches(vswRequest);
    const vpcVsws = vsws.body.vSwitches.vSwitch.filter(vsw => vsw.vpcId === vpcId);
    
    console.log(`  VPC ID: ${vpcId}`);
    if (vpcVsws.length > 0) {
      console.log(`  交换机 ID: ${vpcVsws[0].vSwitchId}`);
      console.log(`  可用区: ${vpcVsws[0].zoneId}`);
    }

    // 7. 输出配置信息
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ 安全组配置完成！\n');
    console.log('📝 请将以下配置添加到 backend/.env 文件:\n');
    console.log(`ALIYUN_VPC_ID=${vpcId}`);
    if (vpcVsws.length > 0) {
      console.log(`ALIYUN_VSWITCH_ID=${vpcVsws[0].vSwitchId}`);
    }
    console.log(`ALIYUN_SECURITY_GROUP_ID=${targetSg.securityGroupId}`);
    console.log('\n然后重启灵犀云服务:');
    console.log('  pm2 restart lingxi-cloud');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ 配置失败:', error.message);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
