/**
 * 通过 SSH 远程安装/更新 Lume 插件（openclaw-lume @ 18790）
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { PROJECT_ROOT, LUME_PLUGIN_PORT, LUME_WS_SECRET } from './openclaw-deploy-constants.js';

const require = createRequire(import.meta.url);
const { Client: SSHClient } = require('ssh2');

const PLUGIN_SRC = path.join(PROJECT_ROOT, 'installer', 'plugins', 'openclaw-lume');

function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream
        .on('close', (code) => {
          if (code === 0) resolve(out);
          else reject(new Error(out || `远程命令失败 (code ${code})`));
        })
        .on('data', (d) => {
          out += d.toString();
        })
        .stderr.on('data', (d) => {
          out += d.toString();
        });
    });
  });
}

function uploadDirectory(sftp, localDir, remoteDir) {
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  const tasks = entries
    .filter((e) => e.name !== 'node_modules')
    .map((entry) => {
      const localPath = path.join(localDir, entry.name);
      const remotePath = `${remoteDir}/${entry.name}`;
      if (entry.isDirectory()) {
        return new Promise((res, rej) => {
          sftp.mkdir(remotePath, (err) => {
            if (err && err.code !== 4) return rej(err);
            uploadDirectory(sftp, localPath, remotePath).then(res).catch(rej);
          });
        });
      }
      return new Promise((res, rej) => {
        sftp.fastPut(localPath, remotePath, (err) => (err ? rej(err) : res()));
      });
    });
  return Promise.all(tasks);
}

/**
 * @param {{ host: string, port?: number, password: string, serverIp?: string }} opts
 */
export async function deployLumePluginOverSsh(opts) {
  const { host, port = 22, password, serverIp } = opts;

  if (!fs.existsSync(path.join(PLUGIN_SRC, 'openclaw.plugin.json'))) {
    throw new Error('本地 Lume 插件源码不存在');
  }

  const conn = new SSHClient();

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host,
      port,
      username: 'root',
      password,
      readyTimeout: 20000,
    });
  });

  try {
    const remotePlugin = '/root/.openclaw/workspace/plugins/openclaw-lume';
    const remoteTmp = '/tmp/openclaw-lume-upload';

    await execRemote(
      conn,
      `rm -rf "${remoteTmp}" && mkdir -p "${remoteTmp}" "${remotePlugin}"`,
    );

    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        uploadDirectory(sftp, PLUGIN_SRC, remoteTmp)
          .then(() => {
            sftp.end();
            resolve();
          })
          .catch(reject);
      });
    });

    const secret = LUME_WS_SECRET;
    const ip = serverIp || host;
    const script = `
set -e
rsync -a --delete "${remoteTmp}/" "${remotePlugin}/" 2>/dev/null || cp -a "${remoteTmp}/." "${remotePlugin}/"
rm -rf "${remoteTmp}"
cd "${remotePlugin}"
npm install --production --no-audit --no-fund 2>/dev/null || npm install ws --no-audit --no-fund
python3 << 'PYEOF'
import json, os
config_file = os.path.expanduser("~/.openclaw/openclaw.json")
plugin_path = os.path.expanduser("~/.openclaw/workspace/plugins/openclaw-lume")
with open(config_file, "r") as f:
    config = json.load(f)
config.setdefault("channels", {}).setdefault("lume", {})["port"] = ${LUME_PLUGIN_PORT}
config["channels"]["lume"]["secret"] = "${secret}"
config.setdefault("plugins", {}).setdefault("entries", {}).setdefault("lume", {})["enabled"] = True
paths = config.setdefault("plugins", {}).setdefault("load", {}).setdefault("paths", [])
norm = plugin_path
if norm not in paths:
    paths.append(norm)
with open(config_file, "w") as f:
    json.dump(config, f, indent=2)
print("openclaw.json updated")
PYEOF
pkill -f "openclaw gateway" 2>/dev/null || true
sleep 2
cd ~/.openclaw
nohup openclaw gateway > /var/log/openclaw.log 2>&1 &
sleep 5
if ss -tlnp 2>/dev/null | grep -q ":${LUME_PLUGIN_PORT}"; then
  echo "LUME_PLUGIN_OK"
else
  echo "LUME_PLUGIN_PENDING"
  tail -15 /var/log/openclaw.log 2>/dev/null || true
  exit 1
fi
`;

    const out = await execRemote(conn, script);
    return { ok: true, log: out, port: LUME_PLUGIN_PORT, ip };
  } finally {
    conn.end();
  }
}
