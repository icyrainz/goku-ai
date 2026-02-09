import fs from 'node:fs';
import path from 'node:path';
import { detectFileType, isSupportedFile } from './types.js';

export interface VaultFile {
  relativePath: string;
  absolutePath: string;
  fileType: string;
}

export function walkVault(vaultPath: string): VaultFile[] {
  const results: VaultFile[] = [];
  const entries = fs.readdirSync(vaultPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(vaultPath, entry.name);
    const relPath = path.relative(vaultPath, fullPath);

    if (entry.isDirectory()) {
      // Skip hidden dirs and known skip dirs
      if (entry.name.startsWith('.') || ['.git', '.obsidian', '.note-taker', '.trash'].includes(entry.name)) {
        continue;
      }
      // Recurse into subdirectory
      const subFiles = walkVault(fullPath);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      // Check if file type is supported
      if (isSupportedFile(fullPath)) {
        const fileType = detectFileType(fullPath);
        if (fileType) {
          results.push({
            relativePath: relPath,
            absolutePath: fullPath,
            fileType,
          });
        }
      }
    }
  }

  // Sort results by relativePath alphabetically
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}