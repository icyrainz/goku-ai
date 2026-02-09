import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';

export const statusCommand = new Command('status')
  .description('Show vault/processing/graph stats')
  .action(async () => {
    const config = loadConfig();
    const db = getDb(config);

    // Count vault files
    const vaultPath = config.vault.path;
    let fileCount = 0;
    try {
      function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || ['.git', '.obsidian', '.app-data', '.trash'].includes(entry.name)) {
              // Skip hidden dirs and .app-data
              continue;
            }
            walk(fullPath);
          } else {
            // Count only files (not directories)
            fileCount++;
          }
        }
      }
      walk(vaultPath);
    } catch (e) {
      console.error('Error counting files:', e);
    }

    // Query DB for stats
    const docCountResult = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number } | undefined;
    const processedCount = db.prepare('SELECT processed, COUNT(*) as count FROM documents GROUP BY processed').all();
    const entityCountByType = db.prepare('SELECT type, COUNT(*) as count FROM entities GROUP BY type ORDER BY count DESC').all();
    const relationshipCount = db.prepare('SELECT COUNT(*) as count FROM relationships').get() as { count: number } | undefined;

    // Output format
    console.log(`Vault:       ${vaultPath} (${fileCount} files)`);
    console.log(`Documents:   ${docCountResult?.count ?? 0} indexed`);
    console.log('');

    console.log('Processing:');
    const processedRows = processedCount as any[];
    const processedRow = processedRows.find((row: any) => row.processed === 1);
    console.log(`  ✓ Processed:  ${processedRow?.count ?? 0}`);
    const pendingRow = processedRows.find((row: any) => row.processed === 0);
    console.log(`  ⏳ Pending:    ${pendingRow?.count ?? 0}`);
    const erroredRow = processedRows.find((row: any) => row.processed === 2);
    console.log(`  ✗ Errored:     ${erroredRow?.count ?? 0}`);

    console.log('');
    console.log('Graph:');
    const entitiesRows = entityCountByType as any[];
    const entitiesRow = entitiesRows.find((row: any) => row.type);
    console.log(`  Entities:      ${entitiesRow?.count ?? 0} (person: ${entitiesRows.find((row: any) => row.type === 'person')?.count ?? 0}, property: ${entitiesRows.find((row: any) => row.type === 'property')?.count ?? 0}, ...)`);
    console.log(`  Relationships: ${relationshipCount?.count ?? 0}`);
  });