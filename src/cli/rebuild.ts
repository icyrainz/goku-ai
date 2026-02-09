import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';

export const rebuildCommand = new Command('rebuild')
  .description('Delete the entire graph index and reset all documents for reprocessing')
  .action(() => {
    const config = loadConfig();
    const db = getDb(config);

    db.exec('DELETE FROM document_entities');
    db.exec('DELETE FROM relationships');
    db.exec('DELETE FROM entities');

    // Drop and recreate FTS tables (handles corruption gracefully)
    db.exec('DROP TABLE IF EXISTS entities_fts');
    db.exec('DROP TABLE IF EXISTS documents_fts');

    db.exec(`
      CREATE VIRTUAL TABLE entities_fts USING fts5(
        name, aliases,
        content=entities, content_rowid=rowid
      )
    `);
    db.exec(`
      CREATE VIRTUAL TABLE documents_fts USING fts5(
        title, extracted_text,
        content=documents, content_rowid=rowid
      )
    `);

    db.exec("UPDATE documents SET processed = 0, error_msg = NULL");

    // Re-populate documents FTS from existing documents
    db.exec(`
      INSERT INTO documents_fts(rowid, title, extracted_text)
      SELECT rowid, title, extracted_text FROM documents
    `);

    const count = (db.prepare('SELECT COUNT(*) as c FROM documents').get() as { c: number }).c;
    console.log(`Graph cleared. ${count} documents reset to pending.`);
    console.log('Run \`note process\` to rebuild the graph.');
  });