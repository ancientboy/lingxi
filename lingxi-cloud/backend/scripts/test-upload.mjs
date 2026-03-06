// test-upload.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testUpload() {
  // 测试上传图片
  const imagePath = process.argv[2] || '/root/.openclaw/workspace/test-image.png';
  
  if (!fs.existsSync(imagePath)) {
    console.log('创建测试图片...');
    // 创建测试图片 (1x1 红色像素)
    const pngData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
      0x01, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x00, 0x00, 0x00, 0x0A,
      0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    fs.writeFileSync(imagePath, pngData);
  }

  console.log('测试图片:', imagePath);
  console.log('文件大小:', fs.statSync(imagePath).size, 'bytes');

  // 测试上传
  const formData = new FormData();
  formData.append('file', fs.createReadStream(imagePath), {
    filename: path.basename(imagePath),
    contentType: 'image/png'
  });

  try {
    const res = await fetch('http://localhost:3000/api/upload/image', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    const data = await res.json();
    console.log('上传响应:', res.status, data);
  } catch (e) {
    console.error('上传失败:', e.message);
  }
}

testUpload();
