/**
 * TCP 端口探测（Gateway / Lume 插件健康检查）
 */

import net from 'net';

export function probeTcp(host, port, timeoutMs = 4000) {
  if (!host || !port) return Promise.resolve(false);

  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: timeoutMs });
    const done = (ok) => {
      try {
        sock.destroy();
      } catch (_) {}
      resolve(ok);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.once('timeout', () => done(false));
  });
}
