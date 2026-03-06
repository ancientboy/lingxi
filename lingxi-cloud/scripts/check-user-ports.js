#!/usr/bin/env node

/**
 * 检查用户服务器的文件服务端口
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

require('dotenv').config({ path: join(__dirname, '..', 'backend', '.env') });

const https = require('https');
const http = require('http');

// 用户服务器列表
const USERS = [
  { name: '57', ip: '120.26.17.83', instanceId: 'i-bp1abqv5dbxuwxr8lzyv' },
  { name: '褚时', ip: '114.55.149.200', instanceId: 'i-bp188n2ksvk06l6nh2p8' },
  { name: 'kryon', ip: '120.26.139.153', instanceId: 'i-bp1dbfdnpw4342ugrlr6' },
  { name: 'paul', ip: '120.26.33.181', instanceId: 'i-bp1gqbfi5vg7vzkwu5f6' },
];

async function checkPort(ip, port, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: ip,
      port: port,
      path: '/health',
      method: 'GET',
      timeout: timeout,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data: data.substring(0, 100) });
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'timeout' });
    });

    req.end();
  });
}

async function main() {
  console.log('🔍 检查用户服务器端口状态\n');
  console.log('='.repeat(60));

  const results = [];

  for (const user of USERS) {
    console.log(`\n👤 ${user.name} (${user.ip})`);
    
    // 检查 OpenClaw 端口 (18789)
    const openclawResult = await checkPort(user.ip, 18789);
    console.log(`  端口 18789 (OpenClaw): ${openclawResult.error ? '❌ ' + openclawResult.error : '✅ ' + openclawResult.status}`);
    
    // 检查文件服务端口 (9876)
    const fileServerResult = await checkPort(user.ip, 9876);
    console.log(`  端口 9876 (文件服务): ${fileServerResult.error ? '❌ ' + fileServerResult.error : '✅ ' + fileServerResult.status}`);
    
    if (fileServerResult.status === 200) {
      console.log(`  📋 文件服务响应: ${fileServerResult.data}`);
    }

    results.push({
      user: user.name,
      ip: user.ip,
      instanceId: user.instanceId,
      openclaw: openclawResult.error ? 'offline' : 'online',
      fileServer: fileServerResult.error ? 'offline' : 'online',
    });
  }

  // 总结
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 端口状态总结:\n');
  
  console.log('用户\t\tIP\t\t\tOpenClaw\t文件服务');
  console.log('-'.repeat(60));
  
  for (const r of results) {
    console.log(`${r.user}\t\t${r.ip}\t${r.openclaw === 'online' ? '✅' : '❌'}\t\t${r.fileServer === 'online' ? '✅' : '❌'}`);
  }

  // 需要部署文件服务的用户
  const needDeploy = results.filter(r => r.fileServer === 'offline');
  
  if (needDeploy.length > 0) {
    console.log('\n⚠️  以下用户需要部署文件服务:\n');
    needDeploy.forEach(r => {
      console.log(`  - ${r.user} (${r.ip})`);
    });
    
    console.log('\n📝 部署命令:');
    console.log('  cd /home/admin/.openclaw/workspace/lingxi-cloud/deploy');
    needDeploy.forEach(r => {
      console.log(`  ./deploy-file-server-existing.sh ${r.ip}`);
    });
  } else {
    console.log('\n✅ 所有用户的文件服务都已部署！');
  }

  // 检查安全组配置
  console.log('\n' + '='.repeat(60));
  console.log('\n🔐 安全组配置检查:\n');
  
  const { createRequire } = require('module');
  const Ecs = require('@alicloud/ecs20140526');
  const EcsClient = Ecs.default;
  const $OpenApi = require('@alicloud/openapi-client');

  const clientConfig = new $OpenApi.Config({
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  const client = new EcsClient(clientConfig);

  try {
    // 获取实例的安全组信息
    for (const r of results) {
      const describeRequest = new Ecs.DescribeInstancesRequest({
        regionId: 'cn-hangzhou',
        instanceIds: JSON.stringify([r.instanceId]),
      });
      
      const response = await client.describeInstances(describeRequest);
      const instance = response.body.instances.instance[0];
      
      if (instance) {
        console.log(`${r.user}:`);
        console.log(`  安全组: ${instance.securityGroupIds.securityGroupId.join(', ')}`);
      }
    }
  } catch (error) {
    console.log('  ⚠️  无法获取安全组信息:', error.message);
  }

  console.log('\n✨ 检查完成！\n');
}

main();
