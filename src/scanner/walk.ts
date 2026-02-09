import fs from 'node:fs';
import path from 'node:path';
import { detectFileType, isSupportedFile } from './types.js';

export interface VaultFile {
  relativePath: string;
  absolutePath: string;
  fileType: string;
}

export function walkVault(vaultPath: string, rootPath?: string): VaultFile[] {
  const root = rootPath ?? vaultPath;
  const results: VaultFile[] = [];
  const entries = fs.readdirSync(vaultPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(vaultPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || ['.git', '.obsidian', '.app-data', '.trash'].includes(entry.name)) {
        continue;
      }
      const subFiles = walkVault(fullPath, root);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      if (isSupportedFile(fullPath)) {
        const fileType = detectFileType(fullPath);
        if (fileType) {
          results.push({
            relativePath: path.relative(root, fullPath),
            absolutePath: fullPath,
            fileType,
          });
        }
      }
    }
  }

  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}