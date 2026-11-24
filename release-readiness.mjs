import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { shippedAssets } from './release-store.mjs';

// No writes, network calls, credentials, or player state are involved. Probes
// share an in-flight check and cache its result for at most one second.
export function createReadinessProbe({ releases, playDirectory, maxAgeMs = 1000 }) {
  let pending, expires = 0, lastError;
  async function check() {
    await releases.readiness();
    const html = await readFile(resolve(playDirectory, 'index.html'), 'utf8');
    const paths = new Set(['index.html', ...shippedAssets.map(file => 'assets/' + file)]);
    for (const match of html.matchAll(/<(?:script|img|link)\b[^>]*?\b(?:src|href)="([^"]+)"/gi)) {
      const url = new URL(match[1], 'https://skygate.invalid/play/');
      if (url.origin !== 'https://skygate.invalid' || !url.pathname.startsWith('/play/')) throw Error('Unexpected public game dependency');
      paths.add(url.pathname.slice('/play/'.length));
    }
    for (const path of paths) {
      const file = await open(resolve(playDirectory, path), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size < 1) throw Error('Public game dependency is unavailable');
        if ((await file.read(Buffer.alloc(1), 0, 1, 0)).bytesRead !== 1) throw Error('Public game dependency is unreadable');
      } finally { await file.close(); }
    }
  }
  return async () => {
    if (pending) return pending;
    if (Date.now() < expires) { if (lastError) throw lastError; return; }
    pending = check().then(() => { lastError = null; }, error => { lastError = error; throw error; })
      .finally(() => { expires = Date.now() + maxAgeMs; pending = null; });
    return pending;
  };
}
