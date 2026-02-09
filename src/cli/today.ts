import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';
import type Database from 'better-sqlite3';

interface TodayEntry {
  id: string;
  kind: string;
  file_path: string | null;
  title: string | null;
  content: string | null;
  extracted_text: string | null;
  processed: number;
  created_at: string;
}

interface EntityMention {
  entity_name: string;
  entity_type: string;
  mention: string | null;
}

function getEntitiesForDocument(db: Database.Database, docId: string): EntityMention[] {
  return db.prepare(`
    SELECT e.name as entity_name, e.type as entity_type, de.mention
    FROM document_entities de
    JOIN entities e ON de.entity_id = e.id
    WHERE de.document_id = ?
    ORDER BY e.type, e.name
  `).all(docId) as EntityMention[];
}

function highlightEntities(text: string, entities: EntityMention[]): string {
  let result = text;
  for (const e of entities) {
    const term = e.mention || e.entity_name;
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'gi');
    result = result.replace(re, `\x1b[33m$1\x1b[0m`);
  }
  return result;
}

export const todayCommand = new Command('today')
  .description("Show entries for a date with extracted entities highlighted")
  .argument('[date]', 'Date to view (YYYY-MM-DD), defaults to today')
  .action((date?: string) => {
    const config = loadConfig();
    const db = getDb(config);

    const today = date || new Date().toISOString().slice(0, 10);

    const entries = db.prepare(`
      SELECT id, kind, file_path, title, content, extracted_text, processed, created_at
      FROM documents
      WHERE date = ?
      ORDER BY created_at ASC
    `).all(today) as TodayEntry[];

    if (entries.length === 0) {
      console.log(`No entries for today (${today}).`);
      return;
    }

    console.log(`\n📅 ${today} — ${entries.length} entries\n`);

    for (const entry of entries) {
      const source = entry.file_path || '(unknown)';
      const title = entry.title || '(untitled)';

      console.log(`━━━ ${title} [${source}] ━━━`);

      const text = entry.content || entry.extracted_text || '';
      if (!text.trim()) {
        console.log('  (empty)\n');
        continue;
      }

      const entities = getEntitiesForDocument(db, entry.id);

      if (entities.length > 0) {
        const highlighted = highlightEntities(text, entities);
        console.log(highlighted);

        const grouped = new Map<string, string[]>();
        for (const e of entities) {
          const list = grouped.get(e.entity_type) || [];
          list.push(e.entity_name);
          grouped.set(e.entity_type, list);
        }
        const tags = [...grouped.entries()]
          .map(([type, names]) => `${type}: ${[...new Set(names)].join(', ')}`)
          .join('  |  ');
        console.log(`  \x1b[2m[${tags}]\x1b[0m`);
      } else if (entry.processed === 1) {
        console.log(text);
        console.log('  \x1b[2m[no entities extracted]\x1b[0m');
      } else {
        console.log(text);
        console.log('  \x1b[2m[pending — run \`note process\`]\x1b[0m');
      }

      console.log('');
    }
  });
