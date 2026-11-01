import { readFile } from 'node:fs/promises';
import { routerConfigSchema } from './schema.js';
export const defaultConfigUrl = new URL('../config/default.json', import.meta.url);
export async function loadConfig(path: string | URL = defaultConfigUrl) {
  // Explicit path only: no downloads, environment expansion or silent fallback.
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text, 'utf8') > 1_048_576) throw new Error('Router configuration exceeds 1 MiB');
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new Error('Router configuration is not valid JSON'); }
  return routerConfigSchema.parse(value);
}
