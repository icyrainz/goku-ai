import { readFileSync } from 'node:fs';
import initXxhash from 'xxhash-wasm';

let hasher: Awaited<ReturnType<typeof initXxhash>> | null = null;

async function getHasher() {
  if (!hasher) {
    hasher = await initXxhash();
  }
  return hasher;
}

export async function hashFile(absolutePath: string): Promise<string> {
  const h = await getHasher();
  const content = readFileSync(absolutePath);
  return h.h64ToString(content.toString('utf8'));
}