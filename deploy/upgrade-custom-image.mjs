#!/usr/bin/env node
/**
 * 升级阿里云自定义镜像中的 OpenClaw 版本
 */

import Ecs from '@alicloud/ecs20140526';
import * as $OpenApi from '@alicloud/openapi-client';
import { Client as SSHClient } from 'ssh2';
import 'dotenv/config';

const config = {
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  region: process.env.ALIYUN_REGION || 'cn-hangzhou',
  zone: process.env.ALIYUN_ZONE || 'cn-hangzhou-h',
  vSwitchId: process.env.ALIYUN_VSWITCH_ID,
  securityGroupId: process.env.ALIYUN_SECURITY_GROUP_ID,
  instanceType: process.env.ALIYUN_INSTANCE_TYPE || 'ecs.t5-c1m2.large',
  sourceImageId: process.env.ALIYUN_CUSTOM_IMAGE_ID,
  password: process.env.USER_SERVER_PASSWORD || 'Lingxi@2026!',
  targetVersion: process.argv[2] || '2.25',
};

console.log('🔧 升级配置:');
console.log(`   源镜像: ${config.sourceImageId}`);
console.log(`   目标版本: ${config.targetVersion}`);
console.log(`   区域: ${config.region}`);
console.log('');

// 创建 ECS 客户端
function createEcsClient() {
  const clientConfig = new $OpenApi.Config({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
  });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  clientConfig.readTimeout = 120000;
  clientConfig.connectTimeout = 60000;
  return new Ecs.default(clientConfig);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForSSH(host, port, password, timeout = 120000) {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - startTime > timeout) {
        reject(new Error('SSH 连接超时'));
        return;
      }
      
      const conn = new SSHClient();
      
      conn.on('ready', () => {
        conn.end();
        resolve();
      });
      
      conn.on('error', () => {
        console.log('   SSH 未就绪，5秒后重试...');
        setTimeout(tryConnect, 5000);
      });
      
      conn.connect({
        host,
        port,
        username: 'root',
        password,
        readyTimeout: 10000,
      });
    };
    
    tryConnect();
  });
}

async function runUpgrade() {
  const client = createEcsClient();
  const instanceName = `openclaw-upgrade-${Date.now()}`;
  
  try {
    // 1. 创建临时实例
    console.log('📦 步骤 1/5: 创建临时 ECS 实例...');
    
    const createRequest = new Ecs.CreateInstanceRequest({
      regionId: config.region,
      zoneId: config.zone,
      instanceType: config.instanceType,
      imageId: config.sourceImageId,
      securityGroupId: config.securityGroupId,
      vSwitchId: config.vSwitchId,
      instanceName,
      password: config.password,
      internetMaxBandwidthOut: 5,
      allocatePublicIp: true,
      networkChargeType: 'PayByBandwidth',
    });
    
    const createResponse = await client.createInstance(createRequest);
    const instanceId = createResponse.body.instanceId;
    console.log(`   ✅ 实例创建成功: ${instanceId}`);
    
    // 2. 启动实例并等待
    console.log('🚀 步骤 2/5: 启动实例...');
    
    await sleep(5000);
    await client.startInstance(new Ecs.StartInstanceRequest({ instanceId }));
    
    // 等待运行
    let publicIp = null;
    let retries = 0;
    const maxRetries = 60;
    
    while (retries < maxRetries) {
      await sleep(5000);
      retries++;
      
      const describeRequest = new Ecs.DescribeInstancesRequest({
        regionId: config.region,
        instanceIds: JSON.stringify([instanceId]),
      });
      
      const describeResponse = await client.describeInstances(describeRequest);
      const instance = describeResponse.body.instances.instance[0];
      
      if (instance?.status === 'Running') {
        const ipList = instance.publicIpAddress?.ipAddress || [];
        publicIp = ipList[0];
        if (publicIp) {
          console.log(`   ✅ 实例已运行: ${publicIp}`);
          break;
        }
      }
      
      console.log(`   等待实例启动... (${retries}/${maxRetries})`);
    }
    
    if (!publicIp) {
      throw new Error('实例启动超时');
    }
    
    // 3. SSH 升级 OpenClaw
    console.log('⬆️ 步骤 3/5: SSH 升级 OpenClaw...');
    
    await waitForSSH(publicIp, 22, config.password);
    console.log('   ✅ SSH 连接成功');
    
    await new Promise((resolve, reject) => {
      const conn = new SSHClient();
      
      conn.on('ready', () => {
        console.log('   开始升级 OpenClaw...');
        
        const upgradeCommands = `
set -e

echo "当前版本:"
openclaw --version || echo "未安装"

echo ""
echo "升级到 ${config.targetVersion}..."
npm install -g openclaw@${config.targetVersion}

echo ""
echo "升级后版本:"
openclaw --version

echo ""
echo "✅ 升级完成!"
`;
        
        conn.exec(upgradeCommands, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }
          
          stream.on('close', (code) => {
            conn.end();
            if (code === 0) {
              console.log('   ✅ OpenClaw 升级成功');
              resolve();
            } else {
              reject(new Error(`升级脚本退出码: ${code}`));
            }
          });
          
          stream.on('data', (data) => {
            process.stdout.write(data.toString());
          });
          
          stream.stderr.on('data', (data) => {
            process.stderr.write(data.toString());
          });
        });
      });
      
      conn.on('error', reject);
      
      conn.connect({
        host: publicIp,
        port: 22,
        username: 'root',
        password: config.password,
        readyTimeout: 30000,
      });
    });
    
    // 4. 停止实例并创建镜像
    console.log('📸 步骤 4/5: 创建新镜像...');
    
    await client.stopInstance(new Ecs.StopInstanceRequest({ 
      instanceId,
      forceStop: true 
    }));
    
    // 等待停止
    retries = 0;
    while (retries < 30) {
      await sleep(5000);
      retries++;
      
      const describeRequest = new Ecs.DescribeInstancesRequest({
        regionId: config.region,
        instanceIds: JSON.stringify([instanceId]),
      });
      
      const describeResponse = await client.describeInstances(describeRequest);
      const instance = describeResponse.body.instances.instance[0];
      
      if (instance?.status === 'Stopped') {
        console.log('   ✅ 实例已停止');
        break;
      }
      
      console.log(`   等待实例停止... (${retries}/30)`);
    }
    
    // 创建镜像
    const newImageName = `openclaw-${config.targetVersion}-${Date.now()}`;
    const imageRequest = new Ecs.CreateImageRequest({
      regionId: config.region,
      instanceId,
      imageName: newImageName,
      description: `OpenClaw ${config.targetVersion} with Node.js 22`,
    });
    
    const imageResponse = await client.createImage(imageRequest);
    const newImageId = imageResponse.body.imageId;
    console.log(`   ✅ 镜像创建中: ${newImageId}`);
    
    // 5. 等待镜像创建完成
    console.log('⏳ 步骤 5/5: 等待镜像创建完成...');
    
    retries = 0;
    while (retries < 60) {
      await sleep(10000);
      retries++;
      
      try {
        const describeImageRequest = new Ecs.DescribeImagesRequest({
          regionId: config.region,
          imageId: newImageId,
        });
        
        const describeImageResponse = await client.describeImages(describeImageRequest);
        const image = describeImageResponse.body.images.image[0];
        
        if (image?.status === 'Available') {
          console.log(`   ✅ 镜像创建完成: ${newImageId}`);
          break;
        }
        
        console.log(`   镜像状态: ${image?.status || 'Unknown'} (${retries}/60)`);
      } catch (err) {
        console.log(`   查询镜像状态: ${err.message}`);
      }
    }
    
    // 6. 清理临时实例
    console.log('🧹 清理临时实例...');
    await client.deleteInstance(new Ecs.DeleteInstanceRequest({ 
      instanceId,
      force: true 
    }));
    console.log('   ✅ 临时实例已删除');
    
    // 7. 输出结果
    console.log('');
    console.log('══════════════════════════════════════════════════════');
    console.log('🎉 升级完成！');
    console.log('══════════════════════════════════════════════════════');
    console.log(`   新镜像 ID: ${newImageId}`);
    console.log(`   OpenClaw 版本: ${config.targetVersion}`);
    console.log('');
    console.log('📝 更新 .env 文件:');
    console.log(`   ALIYUN_CUSTOM_IMAGE_ID=${newImageId}`);
    console.log('══════════════════════════════════════════════════════');
    
    return newImageId;
    
  } catch (error) {
    console.error('❌ 升级失败:', error.message);
    throw error;
  }
}

runUpgrade().catch(console.error);
