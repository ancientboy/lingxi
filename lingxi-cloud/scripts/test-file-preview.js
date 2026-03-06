#!/usr/bin/env node

/**
 * 测试文件预览功能
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// 工作目录
const WORKSPACE = '/root/.openclaw/workspace';

// 创建测试图片（Base64 编码的简单 PNG）
const createTestImage = () => {
  // 最小的 PNG 图片（1x1 像素，红色）
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
    0x01, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x00, 0x00, 0x00, 0x0A,
    0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  
  const testImagePath = join(WORKSPACE, 'test-image.png');
  fs.writeFileSync(testImagePath, pngData);
  console.log('✅ 测试图片已创建:', testImagePath);
  
  return testImagePath;
};

// 测试文件服务
const testFileServer = async (imagePath) => {
  const fileName = imagePath.split('/').pop();
  const fileServerUrl = `http://120.55.192.144:9876`;
  
  console.log('\n📋 测试文件服务:\n');
  
  // 1. 健康检查
  console.log('1. 健康检查...');
  const healthRes = await fetch(`${fileServerUrl}/health`);
  console.log(`   状态: ${healthRes.status}`);
  const healthData = await healthRes.json();
  console.log(`   响应:`, healthData);
  
  // 2. 预览接口
  console.log('\n2. 预览接口测试...');
  const previewUrl = `${fileServerUrl}/preview?path=${fileName}`;
  console.log(`   URL: ${previewUrl}`);
  const previewRes = await fetch(previewUrl);
  console.log(`   状态: ${previewRes.status}`);
  console.log(`   Content-Type: ${previewRes.headers.get('content-type')}`);
  
  // 3. 静态文件接口
  console.log('\n3. 静态文件接口测试...');
  const staticUrl = `${fileServerUrl}/files/${fileName}`;
  console.log(`   URL: ${staticUrl}`);
  const staticRes = await fetch(staticUrl);
  console.log(`   状态: ${staticRes.status}`);
  console.log(`   Content-Type: ${staticRes.headers.get('content-type')}`);
  
  // 4. 文件列表
  console.log('\n4. 文件列表测试...');
  const listUrl = `${fileServerUrl}/list?path=/`;
  console.log(`   URL: ${listUrl}`);
  const listRes = await fetch(listUrl);
  console.log(`   状态: ${listRes.status}`);
  const listData = await listRes.json();
  console.log(`   文件数量: ${listData.files?.length || 0}`);
  if (listData.files && listData.files.length > 0) {
    console.log(`   第一个文件:`, listData.files[0]);
  }
  
  // 5. 测试结果
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 测试结果:\n');
  
  if (previewRes.ok && staticRes.ok) {
    console.log('✅ 文件预览功能正常！');
    console.log('\n📝 前端使用示例:');
    console.log(`   预览 URL: ${previewUrl}`);
    console.log(`   静态 URL: ${staticUrl}`);
  } else {
    console.log('❌ 文件预览功能有问题');
    console.log(`   预览状态: ${previewRes.status}`);
    console.log(`   静态状态: ${staticRes.status}`);
  }
};

// 主函数
const main = async () => {
  try {
    console.log('🧪 测试文件预览功能\n');
    console.log('工作目录:', WORKSPACE);
    console.log('');
    
    // 创建测试图片
    const imagePath = createTestImage();
    
    // 测试文件服务
    await testFileServer(imagePath);
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

main();
