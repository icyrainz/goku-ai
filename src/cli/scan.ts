import { Command } from 'commander';
import type { Config } from '../config.js';
import type Database from 'better-sqlite3';
import { walkVault } from '../scanner/walk.js';
import { hashFile } from '../scanner/hash.js';
import { getDocumentByFilePath } from '../core/documents.js';
import { createFileDocument } from '../core/documents.js';
import { extractContent } from '../scanner/extractors.js';
import { getPendingDocuments } from '../core/documents.js';
import { deleteDocument } from '../core/documents.js';
import { updateFileDocument } from '../core/documents.js';

export async function scanVault(config: Config, db: Database.Database): Promise<void> {
  const files = walkVault(config.vault.path);
  let newCount = 0, modifiedCount = 0, unchangedCount = 0, deletedCount = 0;

  // Track which file paths we see (for detecting deletions)
  const seenPaths = new Set<string>();

  for (const file of files) {
    seenPaths.add(file.relativePath);
    const hash = await hashFile(file.absolutePath);
    const existing = getDocumentByFilePath(db, file.relativePath);

    if (!existing) {
      // New file
      const extracted = extractContent(file.relativePath, file.absolutePath, file.fileType);
      createFileDocument(db, file.relativePath, hash, file.fileType,
        extracted.title, extracted.date, extracted.extractedText,
        extracted.metadata);
      newCount++;
    } else if (existing.file_hash !== hash) {
      // Modified file
      const extracted = extractContent(file.relativePath, file.absolutePath, file.fileType);
      updateFileDocument(db, existing.id, hash, extracted.title, extracted.date, extracted.extractedText, extracted.metadata);
      modifiedCount++;
    }
  }

  // Detect deleted files: documents with kind='file' whose file_path is not in seenPaths
  const allFileDocs = db.prepare(
    "SELECT id, file_path FROM documents WHERE kind = 'file'"
  ).all() as { id: string; file_path: string }[];

  for (const doc of allFileDocs) {
    if (!seenPaths.has(doc.file_path)) {
      deleteDocument(db, doc.id);
      deletedCount++;
    }
  }

  // Print summary
  const pendingCount = db.prepare(
    "SELECT COUNT(*) as count FROM documents WHERE processed = 0"
  ).get() as { count: number };

  console.log(`Scanning vault... ${files.length} files found`);
  console.log(`  ${newCount} new, ${modifiedCount} modified, ${unchangedCount} unchanged, ${deletedCount} deleted`);
  if (pendingCount.count > 0) {
    console.log(`Run \`note process\` to extract entities from ${pendingCount.count} pending documents`);
  }
}

// Register the scan command
export const scanCommand = new Command('scan')
  .description('Scan vault for new/changed files, queue for processing')
  .action(async (options) => {
    const { loadConfig } = await import('../config.js');
    const { getDb } = await import('../core/db.js');
    const config = loadConfig();
    const db = getDb(config);
    await scanVault(config, db);
  });