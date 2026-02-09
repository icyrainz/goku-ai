import path from 'node:path';

const EXTENSION_MAP: Record<string, string> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.csv': 'csv',
  '.tsv': 'csv',
};

export const SKIP_DIRS = new Set([
  '.git',
  '.obsidian',
  '.app-data',
  '.trash',
  '.DS_Store',
  'node_modules',
]);

export function detectFileType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

export function isSupportedFile(filePath: string): boolean {
  return detectFileType(filePath) !== null;
}