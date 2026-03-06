#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// 测试上传图片
const imagePath = process.argv[2] || '/root/.openclaw/workspace/test-image.png';
if (!fs.existsSync(imagePath)) {
  // 创建测试图片 (1x1 红色像素)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0D, 0x0A, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
    0x0D, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x60, 0x82
  ]);
  fs.writeFileSync(imagePath, pngData);
}

console.log('测试图片已创建:', imagePath);

// 测试上传
const formData = new FormData();
formData.append('file', fs.createReadStream(imagePath), {
  type: 'image/png'
});
const filePath = path.join(__dirname, '../uploads', path.basename(imagePath));
formData.append('file', filePath);
const res = await fetch('http://localhost:3000/api/upload/image', {
  method: 'POST',
  body: formData
});
console.log('上传响应:', res.status, res.statusText ? await res.json() : res.text());
console.log('上传完成');
