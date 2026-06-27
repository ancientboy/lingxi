/**
 * 打包工具
 * 生成用户部署包
 */
import crypto from 'crypto';

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * 生成 Token
 */
export function generateToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * 生成 Session ID
 */
export function generateSessionId() {
  return crypto.randomUUID().substring(0, 8);
}

/**
 * 生成用户部署包
 */
export async function generateUserPackage(userId, token, sessionId) {
  const releasesDir = path.join(PROJECT_ROOT, 'releases', 'users');
  const packageName = `lingxi-team-${Date.now()}`;
  const packageDir = path.join(releasesDir, packageName);
  
  // 创建目录
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(path.join(packageDir, 'config'), { recursive: true });
  
  // 1. 复制基础文件
  const baseFiles = [
    'installer/openclaw.json.template',
    'installer/install.sh'
  ];
  
  for (const file of baseFiles) {
    const src = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(src)) {
      const dest = path.join(packageDir, path.basename(file));
      fs.copyFileSync(src, dest);
    }
  }
  
  // 2. 生成配置文件
  const configPath = path.join(packageDir, 'config', 'openclaw.json');
  const templatePath = path.join(PROJECT_ROOT, 'installer', 'openclaw.json.template');
  
  let configContent = '{}';
  if (fs.existsSync(templatePath)) {
    configContent = fs.readFileSync(templatePath, 'utf8');
  }
  
  // 替换占位符
  configContent = configContent
    .replace(/\{\{TOKEN\}\}/g, token)
    .replace(/\{\{SESSION_ID\}\}/g, sessionId)
    .replace(/\{\{USER_ID\}\}/g, userId);
  
  fs.writeFileSync(configPath, configContent);
  
  // 3. 打包
  const tarFile = `${packageDir}.tar.gz`;
  execSync(`tar -czf ${tarFile} -C ${releasesDir} ${packageName}`, { stdio: 'inherit' });
  
  // 4. 清理临时目录
  fs.rmSync(packageDir, { recursive: true, force: true });
  
  return {
    packagePath: tarFile,
    packageName: `${packageName}.tar.gz`,
    size: fs.statSync(tarFile).size
  };
}

/**
 * 快速生成包（使用预构建包）
 */
export async function quickGeneratePackage(userId, token, sessionId, releasesDir) {
  const basePackage = path.join(PROJECT_ROOT, 'releases', 'base', 'openclaw-base.tar.gz');
  
  if (!fs.existsSync(basePackage)) {
    // 如果没有预构建包，使用完整构建
    return generateUserPackage(userId, token, sessionId);
  }
  
  const packageName = `lingxi-team-${Date.now()}.tar.gz`;
  const packagePath = path.join(releasesDir, packageName);
  
  // 复制基础包
  fs.copyFileSync(basePackage, packagePath);
  
  return {
    packagePath,
    packageName,
    size: fs.statSync(packagePath).size
  };
}

export default {
  generateToken,
  generateSessionId,
  generateUserPackage,
  quickGeneratePackage
};
