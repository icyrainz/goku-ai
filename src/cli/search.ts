import { Command } from 'commander';
import { getDb } from '../core/db.js';
import { searchEntities } from '../core/entities.js';
import { loadConfig } from '../config.js';
import { navigationRepl, NavigationItem } from './repl.js';

export const searchCommand = new Command('search')
  .description('Fuzzy search entities and documents')
  .argument('<query>', 'Search query')
  .action(async (query: string) => {
    const config = loadConfig();
    const db = getDb(config);

    const entityResults = searchEntities(db, query);
    const items: NavigationItem[] = [];

    if (entityResults.length > 0) {
      console.log('\nEntities:');
      for (const e of entityResults) {
        const connectionCount = db.prepare(
          'SELECT COUNT(*) as c FROM relationships WHERE source_id = ? OR target_id = ?'
        ).get(e.id, e.id) as { c: number };
        const docCount = db.prepare(
          'SELECT COUNT(*) as c FROM document_entities WHERE entity_id = ?'
        ).get(e.id) as { c: number };
        items.push({
          type: 'entity',
          id: e.id,
          label: `${e.name} (${e.type}) — ${connectionCount.c} connections, ${docCount.c} documents`,
        });
      }
    }

    const docResults = db.prepare(`
      SELECT d.id, d.title, d.file_path, d.kind, d.date,
             snippet(documents_fts, 1, '→', '←', '...', 30) as snippet
      FROM documents d
      JOIN documents_fts f ON d.rowid = f.rowid
      WHERE documents_fts MATCH ?
      ORDER BY rank
      LIMIT 10
    `).all(query) as any[];

    if (docResults.length > 0) {
      console.log('\nDocuments:');
      for (const d of docResults) {
        const source = d.file_path || `(${d.date || 'unknown'})`;
        const preview = d.snippet || d.title || '(no content)';
        items.push({
          type: 'document',
          id: d.id,
          label: `${source}: ${preview}`,
        });
      }
    }

    if (items.length === 0) {
      console.log('No results found.');
      return;
    }

    const result = await navigationRepl(items);
    if (result.action === 'select') {
      if (result.item.type === 'entity') {
        console.log(`\nRun: note entity ${result.item.id}`);
      } else if (result.item.type === 'document') {
        console.log(`\nDocument selected: ${result.item.label}`);
      }
    }
  });