// Storage driver selector. The rest of the app depends only on this
// interface: put / head / getStream / delete / presignDownload.
// Swap STORAGE_DRIVER=r2 in production; nothing else changes.
import config from '../config.js';
import { localStorage } from './local-fs.js';

let cached = null;

export async function getStorage() {
  if (cached) return cached;
  if (config.storage.driver === 'r2') {
    const { r2Storage } = await import('./r2.js');
    cached = r2Storage;
  } else {
    cached = localStorage;
  }
  return cached;
}
