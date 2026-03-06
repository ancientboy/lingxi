#!/usr/bin/env node

/**
 * 灵犀云 - 阿里云资源查询工具
 * 
 * 查询现有的 VPC、交换机、安全组
 * 帮助用户获取配置信息
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

async function main() {
  console.log('🔍 查询阿里云资源\n');
  console.log('='.repeat(60));

  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const regionId = process.env.ALIYUN_REGION || 'cn-hangzhou';

  if (!accessKeyId || !accessKeySecret) {
    console.error('❌ 缺少阿里云凭证');
    console.error('请先配置 backend/.env 文件');
    process.exit(1);
  }

  // 创建客户端
  const clientConfig = new $OpenApi.Config({
    accessKeyId,
    accessKeySecret,
  });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  const client = new EcsClient(clientConfig);

  try {
    // 1. 查询 VPC
    console.log('\n📋 VPC 列表:\n');
    const vpcRequest = new Ecs.DescribeVpcsRequest({ regionId });
    const vpcs = await client.describeVpcs(vpcRequest);
    
    if (vpcs.body.vpcs.vpc.length === 0) {
      console.log('  ❌ 没有找到 VPC');
      console.log('  💡 请在阿里云控制台创建 VPC');
    } else {
      vpcs.body.vpcs.vpc.forEach((vpc, index) => {
        console.log(`  ${index + 1}. ${vpc.vpcName || '未命名'}`);
        console.log(`     ID: ${vpc.vpcId}`);
        console.log(`     CIDR: ${vpc.cidrBlock}`);
        console.log(`     状态: ${vpc.status}`);
        console.log('');
      });
    }

    // 2. 查询交换机
    console.log('\n📋 交换机列表:\n');
    const vswRequest = new Ecs.DescribeVSwitchesRequest({ regionId });
    const vsws = await client.describeVSwitches(vswRequest);
    
    if (vsws.body.vSwitches.vSwitch.length === 0) {
      console.log('  ❌ 没有找到交换机');
      console.log('  💡 请在阿里云控制台创建交换机');
    } else {
      vsws.body.vSwitches.vSwitch.forEach((vsw, index) => {
        console.log(`  ${index + 1}. ${vsw.vSwitchName || '未命名'}`);
        console.log(`     ID: ${vsw.vSwitchId}`);
        console.log(`     VPC: ${vsw.vpcId}`);
        console.log(`     CIDR: ${vsw.cidrBlock}`);
        console.log(`     可用区: ${vsw.zoneId}`);
        console.log('');
      });
    }

    // 3. 查询安全组
    console.log('\n📋 安全组列表:\n');
    const sgRequest = new Ecs.DescribeSecurityGroupsRequest({ regionId });
    const sgs = await client.describeSecurityGroups(sgRequest);
    
    if (sgs.body.securityGroups.securityGroup.length === 0) {
      console.log('  ❌ 没有找到安全组');
      console.log('  💡 请在阿里云控制台创建安全组');
      console.log('  💡 或运行: node scripts/setup-security-group.js');
    } else {
      sgs.body.securityGroups.securityGroup.forEach((sg, index) => {
        console.log(`  ${index + 1}. ${sg.securityGroupName || '未命名'}`);
        console.log(`     ID: ${sg.securityGroupId}`);
        console.log(`     类型: ${sg.securityGroupType}`);
        console.log(`     VPC: ${sg.vpcId || '经典网络'}`);
        console.log(`     描述: ${sg.description || '无'}`);
        console.log('');
      });
    }

    // 4. 检查灵犀云安全组是否存在
    const lingxiGroup = sgs.body.securityGroups.securityGroup.find(
      sg => sg.securityGroupName === 'lingxi-cloud-standard'
    );

    console.log('='.repeat(60));
    
    if (lingxiGroup) {
      console.log('\n✅ 找到灵犀云标准安全组');
      console.log('\n📝 请将以下配置添加到 backend/.env:\n');
      console.log(`ALIYUN_VPC_ID=${lingxiGroup.vpcId}`);
      
      // 找到对应 VPC 的交换机
      const vpcVsws = vsws.body.vSwitches.vSwitch.filter(vsw => vsw.vpcId === lingxiGroup.vpcId);
      if (vpcVsws.length > 0) {
        console.log(`ALIYUN_VSWITCH_ID=${vpcVsws[0].vSwitchId}`);
      }
      
      console.log(`ALIYUN_SECURITY_GROUP_ID=${lingxiGroup.securityGroupId}`);
      console.log('\n然后运行:');
      console.log('  pm2 restart lingxi-cloud');
    } else {
      console.log('\n❌ 未找到灵犀云标准安全组');
      console.log('\n💡 建议运行自动配置脚本:');
      console.log('  NODE_PATH=./backend/node_modules node scripts/setup-security-group.js');
      console.log('\n或者手动在阿里云控制台创建资源，然后添加配置到 .env 文件');
    }

  } catch (error) {
    console.error('\n❌ 查询失败:', error.message);
    process.exit(1);
  }
}

main();
