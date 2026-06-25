/**
 * OpenClaw 部署常量 — 云端 SSH 部署与本机包共用版本号，路径分离
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/** npm 版本号，与 OSS 包名对齐；可通过环境变量覆盖 */
export const OPENCLAW_VERSION = process.env.OPENCLAW_VERSION || '2026.6.9';

/** 配置模板变更时递增，避免复用旧 tar 包 */
export const CLOUD_PACKAGE_REV = process.env.CLOUD_PACKAGE_REV || '1';

export const NODE_VERSION = '22.14.0';

export const OPENCLAW_PORT = Number(process.env.OPENCLAW_PORT || '18789');

export const LUME_PLUGIN_PORT = Number(process.env.LUME_WS_PORT || '18790');

/** 云端包命名：lingxi-cloud-<userId>-<openclawVersion>-r<rev> */
export function cloudPackageName(userId) {
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `lingxi-cloud-${safe}-${OPENCLAW_VERSION}-r${CLOUD_PACKAGE_REV}`;
}

export const CLOUD_INSTALLER_DIR = path.join(PROJECT_ROOT, 'installer', 'cloud');
export const LOCAL_INSTALLER_DIR = path.join(PROJECT_ROOT, 'installer', 'local');
export const CLOUD_RELEASES_DIR = path.join(PROJECT_ROOT, 'releases', 'cloud');
export const LOCAL_RELEASES_DIR = path.join(PROJECT_ROOT, 'releases', 'local');

/** 可选：OSS 加速安装；未设置则 npm install -g openclaw@version */
export const OPENCLAW_OSS_URL = process.env.OPENCLAW_OSS_URL || '';

export const NODE_OSS_URL =
  process.env.NODE_OSS_URL ||
  'https://lume-openclaw.oss-cn-hangzhou.aliyuncs.com/packages%2Fnode22.tar.xz?Expires=1803473753&OSSAccessKeyId=LTAI5tFwob255ZynLRpQB628&Signature=85q3T7ZuqtvSCmYt2SlSgoi4jRg%3D';
