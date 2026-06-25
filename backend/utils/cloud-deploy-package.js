/**
 * 云端 OpenClaw 部署包生成 — 仅用于 SSH / ECS，与本机桌面包分离
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import {
  CLOUD_INSTALLER_DIR,
  CLOUD_RELEASES_DIR,
  cloudPackageName,
  OPENCLAW_VERSION,
  CLOUD_PACKAGE_REV,
  LUME_WS_SECRET,
} from './openclaw-deploy-constants.js';

export async function generateCloudPackage(userId, gatewayToken, sessionId) {
  if (!userId || !gatewayToken || !sessionId) {
    throw new Error('generateCloudPackage: userId, gatewayToken, sessionId 必填');
  }

  if (!fs.existsSync(CLOUD_RELEASES_DIR)) {
    fs.mkdirSync(CLOUD_RELEASES_DIR, { recursive: true });
  }

  const packageName = cloudPackageName(userId);
  const packagePath = path.join(CLOUD_RELEASES_DIR, `${packageName}.tar.gz`);

  if (fs.existsSync(packagePath)) {
    console.log(`📦 复用云端部署包: ${packageName}.tar.gz`);
    return { packagePath, packageName, gatewayToken, sessionId };
  }

  const scriptPath = path.join(CLOUD_INSTALLER_DIR, 'create-cloud-package.sh');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`云端打包脚本不存在: ${scriptPath}`);
  }

  console.log(`📦 生成云端部署包: ${packageName}`);

  execSync(`chmod +x "${scriptPath}" && "${scriptPath}" "${userId}" "${gatewayToken}" "${sessionId}"`, {
    cwd: CLOUD_INSTALLER_DIR,
    stdio: 'inherit',
    timeout: 120000,
    env: {
      ...process.env,
      OPENCLAW_VERSION,
      CLOUD_PACKAGE_REV,
      ZHIPU_API_KEY: config.env?.ZHIPU_API_KEY || '',
      DASHSCOPE_API_KEY: config.env?.DASHSCOPE_API_KEY || '',
      LUME_WS_SECRET: process.env.LUME_WS_SECRET || LUME_WS_SECRET,
      OUTPUT_DIR: CLOUD_RELEASES_DIR,
    },
  });

  if (!fs.existsSync(packagePath)) {
    const files = fs.readdirSync(CLOUD_RELEASES_DIR);
    const tarFile = files.find((f) => f.startsWith(`lingxi-cloud-${userId}`) && f.endsWith('.tar.gz'));
    if (tarFile) {
      return {
        packagePath: path.join(CLOUD_RELEASES_DIR, tarFile),
        packageName: tarFile.replace('.tar.gz', ''),
        gatewayToken,
        sessionId,
      };
    }
    throw new Error('云端部署包生成失败');
  }

  return { packagePath, packageName, gatewayToken, sessionId };
}
