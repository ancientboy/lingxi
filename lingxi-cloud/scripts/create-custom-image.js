#!/usr/bin/env node

/**
 * 基于 paul 的服务器创建自定义镜像
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

const PAUL_INSTANCE = {
  name: 'paul',
  instanceId: 'i-bp1gqbfi5vg7vzkwu5f6',
  ip: '120.26.33.181',
};

async function main() {
  console.log('📸 创建自定义镜像\n');
  console.log('='.repeat(60));

  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const regionId = process.env.ALIYUN_REGION || 'cn-hangzhou';

  const clientConfig = new $OpenApi.Config({ accessKeyId, accessKeySecret });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  const client = new EcsClient(clientConfig);

  try {
    // 1. 查询实例信息
    console.log(`\n📋 查询 ${PAUL_INSTANCE.name} 的服务器信息...\n`);
    const describeRequest = new Ecs.DescribeInstancesRequest({
      regionId,
      instanceIds: JSON.stringify([PAUL_INSTANCE.instanceId]),
    });

    const response = await client.describeInstances(describeRequest);
    const instance = response.body.instances.instance[0];

    if (!instance) {
      console.log('❌ 实例不存在');
      process.exit(1);
    }

    console.log(`  实例 ID: ${instance.instanceId}`);
    console.log(`  实例名称: ${instance.instanceName}`);
    console.log(`  实例规格: ${instance.instanceType}`);
    console.log(`  公网 IP: ${PAUL_INSTANCE.ip}`);
    console.log(`  系统盘 ID: ${instance.systemDiskId}`);
    console.log(`  镜像 ID: ${instance.imageId}`);

    // 2. 创建镜像
    const imageName = `lingxi-openclaw-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const imageDescription = '灵犀云 OpenClaw 标准镜像 - 预装 Node.js 22 + OpenClaw + 文件服务';

    console.log(`\n\n📸 开始创建自定义镜像...\n`);
    console.log(`  镜像名称: ${imageName}`);
    console.log(`  镜像描述: ${imageDescription}`);

    const createImageRequest = new Ecs.CreateImageRequest({
      regionId,
      instanceId: PAUL_INSTANCE.instanceId,
      imageName,
      description: imageDescription,
    });

    const createResponse = await client.createImage(createImageRequest);
    const imageId = createResponse.body.imageId;

    console.log(`\n✅ 镜像创建请求已提交`);
    console.log(`  镜像 ID: ${imageId}`);
    console.log('\n⏳ 镜像创建中，通常需要 10-20 分钟...\n');

    // 3. 查询镜像状态
    console.log('📊 查询镜像状态...\n');
    let imageReady = false;
    let retries = 0;
    const maxRetries = 60; // 最多等待 10 分钟

    while (!imageReady && retries < maxRetries) {
      await sleep(10000);
      retries++;

      try {
        const describeImageRequest = new Ecs.DescribeImagesRequest({
          regionId,
          imageId,
        });

        const imageResponse = await client.describeImages(describeImageRequest);
        const image = imageResponse.body.images.image[0];

        if (image) {
          const status = image.status;
          const progress = image.progress || '0%';
          console.log(`  [${retries}/${maxRetries}] 状态: ${status}, 进度: ${progress}`);

          if (status === 'Available') {
            imageReady = true;
            console.log('\n✅ 镜像创建完成！\n');
            console.log('='.repeat(60));
            console.log('\n📸 镜像信息:\n');
            console.log(`  镜像 ID: ${image.imageId}`);
            console.log(`  镜像名称: ${image.imageName}`);
            console.log(`  镜像大小: ${image.size} GB`);
            console.log(`  操作系统: ${image.osName}`);
            console.log(`  创建时间: ${image.creationTime}`);
            console.log('\n📝 配置更新:\n');
            console.log('  请将以下配置添加到 backend/.env 文件:\n');
            console.log(`  ALIYUN_CUSTOM_IMAGE_ID=${image.imageId}`);
            console.log('\n  然后重启灵犀云服务:');
            console.log('  pm2 restart lingxi-cloud');
            console.log('\n');
          }
        }
      } catch (err) {
        console.log(`  查询失败: ${err.message}`);
      }
    }

    if (!imageReady) {
      console.log('\n⏳ 镜像创建时间较长，请稍后在阿里云控制台查看');
      console.log(`镜像 ID: ${imageId}`);
    }

  } catch (error) {
    console.error('\n❌ 创建失败:', error.message);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
