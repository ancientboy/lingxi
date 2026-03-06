import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = '/home/admin/.openclaw/workspace/lingxi-cloud/uploads/ai-images';
const BASE_URL = 'http://120.55.192.144:3000/uploads/ai-images';

/**
 * 确保上传目录存在
 */
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (e) {}
}

/**
 * 下载图片并保存到本地
 * @param {string} imageUrl - 图片 URL
 * @param {string} userId - 用户 ID
 * @returns {Promise<string>} - 本地图片 URL
 */
export async function downloadImage(imageUrl, userId) {
  await ensureUploadDir();

  // 创建用户专属目录
  const userDir = path.join(UPLOAD_DIR, userId);
  await fs.mkdir(userDir, { recursive: true });

  // 提取文件名（从 OSS URL 中提取唯一标识）
  const urlObj = new URL(imageUrl);
  const pathname = urlObj.pathname;
  const filename = pathname.split('/').pop() || `${crypto.randomBytes(16).toString('hex')}.png`;

  // 本地文件路径
  const localPath = path.join(userDir, filename);

  // 检查文件是否已存在（避免重复下载）
  try {
    await fs.access(localPath);
    console.log(`✅ 图片已存在: ${filename}`);
    return `${BASE_URL}/${userId}/${filename}`;
  } catch (e) {
    // 文件不存在，继续下载
  }

  // 下载图片
  console.log(`📥 开始下载图片: ${imageUrl}`);
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`下载失败: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(localPath, Buffer.from(buffer));

  console.log(`✅ 图片已保存: ${localPath}`);

  // 返回本地 URL
  return `${BASE_URL}/${userId}/${filename}`;
}

/**
 * 替换文本中的图片 URL（下载到本地）
 * @param {string} text - 原始文本
 * @param {string} userId - 用户 ID
 * @returns {Promise<string>} - 替换后的文本
 */
export async function replaceImageUrls(text, userId) {
  // 匹配阿里云 OSS 的图片 URL
  const imageRegex = /!\[([^\]]*)\]\((https:\/\/dashscope-result[^)]+)\)/g;
  let match;
  let modifiedText = text;
  const replacements = [];

  // 提取所有需要替换的 URL
  while ((match = imageRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const alt = match[1];
    const ossUrl = match[2];

    replacements.push({
      fullMatch,
      ossUrl,
      alt
    });
  }

  // 下载并替换
  for (const { fullMatch, ossUrl, alt } of replacements) {
    try {
      const localUrl = await downloadImage(ossUrl, userId);
      const newMarkdown = `![${alt}](${localUrl})`;
      modifiedText = modifiedText.replace(fullMatch, newMarkdown);
      console.log(`✅ 已替换图片 URL: ${ossUrl.substring(0, 50)}... → ${localUrl}`);
    } catch (error) {
      console.error('❌ 替换图片 URL 失败:', error);
      // 保持原样
    }
  }

  return modifiedText;
}

/**
 * 替换历史消息中的图片 URL（基于文件名匹配）
 * 不下载，只查找本地文件
 * @param {string} text - 原始文本
 * @param {string} userId - 用户 ID
 * @returns {Promise<string>} - 替换后的文本
 */
export async function replaceHistoryImageUrls(text, userId) {
  // 匹配阿里云 OSS 的图片 URL
  const imageRegex = /!\[([^\]]*)\]\((https:\/\/dashscope-result[^)]*\/([a-f0-9-]+\.png)[^)]*)\)/g;
  let match;
  let modifiedText = text;

  while ((match = imageRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const alt = match[1];
    const filename = match[3];

    // 检查本地文件是否存在
    const localPath = path.join(UPLOAD_DIR, userId, filename);
    try {
      await fs.access(localPath);
      // 文件存在，替换 URL
      const localUrl = `${BASE_URL}/${userId}/${filename}`;
      const newMarkdown = `![${alt}](${localUrl})`;
      modifiedText = modifiedText.replace(fullMatch, newMarkdown);
      console.log(`🔄 已替换历史图片 URL: ${filename}`);
    } catch (e) {
      // 文件不存在，保持原样
      console.log(`⚠️ 本地图片不存在: ${filename}`);
    }
  }

  return modifiedText;
}
