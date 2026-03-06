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

// 配置
const REGION_ID = process.env.ALIYUN_REGION || 'cn-hangzhou';
const INSTANCE_ID = 'i-bp1gqbfi5vg7vzkwu5f6'; // paul 的实例 ID
const IMAGE_NAME = 'lingxi-openclaw-paul-20260306';
const IMAGE_VERSION = '1.0.0';

async function main() {
  console.log('🖼️  创建自定义镜像');
  console.log(`区域: ${REGION_ID}`);
  console.log(`实例 ID: ${INSTANCE_ID}`);
  console.log(`镜像名称: ${IMAGE_NAME}`);
  console.log(`镜像版本: ${IMAGE_VERSION}`);
  console.log('');

  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;

  if (!accessKeyId || !accessKeySecret) {
    console.error('❌ 缺少阿里云凭证');
    process.exit(1);
  }

  const clientConfig = new $OpenApi.Config({
    accessKeyId,
    accessKeySecret,
  });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  const client = new EcsClient(clientConfig);

  try {
    // 1. 检查实例状态
    console.log('📋 检查实例状态...\n');
    const describeRequest = new Ecs.DescribeInstancesRequest({
      regionId: REGION_ID,
      instanceIds: JSON.stringify([INSTANCE_ID]),
    });

    const describeResponse = await client.describeInstances(describeRequest);
    const instance = describeResponse.body.instances.instance[0];

    if (!instance) {
      console.error('❌ 实例不存在');
      process.exit(1);
    }

    console.log(`✅ 实例状态: ${instance.status}`);
    console.log(`   规格: ${instance.instanceType}`);
    console.log('');

    // 2. 创建自定义镜像
    console.log('🔄 开始创建镜像...\n');
    const createImageRequest = new Ecs.CreateImageRequest({
      regionId: REGION_ID,
      instanceId: INSTANCE_ID,
      imageName: IMAGE_NAME,
      imageVersion: IMAGE_VERSION,
      description: '灵犀云 OpenClaw 自定义镜像 - 基于 paul 的服务器环境 (Node.js 22 + OpenClaw + PM2 + 文件服务)',

    });

    const createResponse = await client.createImage(createImageRequest);
    const imageId = createResponse.body.imageId;

    console.log(`✅ 錜像创建成功！`);
    console.log(`   镜像 ID: ${imageId}`);
    console.log('');

    // 3. 等待镜像创建完成
    console.log('⏳ 等待镜像创建完成...');
    let imageReady = false;
    let retries = 0;
    const maxRetries = 30; // 最多等待 2.5 分钟

    while (!imageReady && retries < maxRetries) {
      await sleep(5000);
      retries++;

      try {
        const describeImageRequest = new Ecs.DescribeImagesRequest({
          regionId: REGION_ID,
          imageId: imageId,
        });

        const describeImageResponse = await client.describeImages(describeImageRequest);
        const images = describeImageResponse.body.images;
        const image = images?.image?.[0];
        const status = image?.status;

        console.log(`  状态: ${status} (${retries}/${maxRetries})`);

        if (status === 'Available') {
          imageReady = true;
          console.log('✅ 酜像已就绪!');
          console.log(`   大小: ${image.size} GB`);
        }
      } catch (err) {
        console.error(`  查询失败: ${err.message}`);
      }
    }

    if (!imageReady) {
      console.error('❌ 镜像创建超时');
      process.exit(1);
    }

    // 4. 输出镜像信息
    console.log('\n' + '='.repeat(60));
    console.log('\n🎉 自定义镜像创建成功！\n');
    console.log('镜像信息:');
    console.log(`  ID: ${imageId}`);
    console.log(`  名称: ${IMAGE_NAME}`);
    console.log(`  版本: ${IMAGE_VERSION}`);
    console.log(`  区域: ${REGION_ID}`);
    console.log('\n📝 请将以下配置添加到 .env 文件:');
    console.log(`ALIYUN_CUSTOM_IMAGE_ID=${imageId}`);
    console.log('\n然后重启灵犀云服务:');
    console.log('  pm2 restart lingxi-cloud');
    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ 创建失败:', error.message);
    process.exit(1);
  }
}

main();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
