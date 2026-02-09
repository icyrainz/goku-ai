import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../core/db.js';
import { getEntityByNameOrId, searchEntities, getRelatedEntities, getDocumentsForEntity } from '../core/entities.js';
import { loadConfig } from '../config.js';
import { navigationRepl, type NavigationItem } from './repl.js';
import type { EntityRow } from '../core/entities.js';

async function showEntity(db: ReturnType<typeof getDb>, entityId: string): Promise<void> {
  const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(entityId) as EntityRow | undefined;
  if (!entity) {
    console.log('Entity not found.');
    return;
  }

  // Header
  console.log(`\n${entity.name} (${entity.type})`);
  console.log('━'.repeat(entity.name.length + entity.type.length + 3));

  const aliases: string[] = JSON.parse(entity.aliases || '[]');
  if (aliases.length > 0) {
    console.log(`Also known as: ${aliases.join(', ')}`);
  }

  // Collect navigation items
  const items: NavigationItem[] = [];

  // Related entities — deduplicate by entity ID, collapse relationship types
  const related = getRelatedEntities(db, entity.id);
  if (related.length > 0) {
    const grouped = new Map<string, { entity: EntityRow; types: string[] }>();
    for (const rel of related) {
      const existing = grouped.get(rel.entity.id);
      if (existing) {
        if (!existing.types.includes(rel.relationshipType)) {
          existing.types.push(rel.relationshipType);
        }
      } else {
        grouped.set(rel.entity.id, { entity: rel.entity, types: [rel.relationshipType] });
      }
    }

    console.log('\nRelated Entities:');
    for (const [, { entity: rel, types }] of grouped) {
      const label = `${rel.name} (${rel.type}) — ${types.join(', ')}`;
      items.push({ type: 'entity', id: rel.id, label });
    }
  }

  // Documents mentioning this entity
  const docs = getDocumentsForEntity(db, entity.id);
  if (docs.length > 0) {
    console.log('\nFound In:');
    for (const doc of docs) {
      let label: string;
      if (doc.kind === 'file' && doc.file_path) {
        const preview = doc.mention || '';
        label = `${doc.file_path}${preview ? ': "' + preview.slice(0, 80) + '"' : ''}`;
      } else {
        const preview = doc.content?.slice(0, 80) || '';
        label = `(entry) ${doc.date || 'undated'}: "${preview}"`;
      }
      items.push({ type: 'document', id: doc.document_id, label });
    }
  }

  if (items.length === 0) {
    console.log('\nNo connections found.');
    return;
  }

  // Navigation loop
  const result = await navigationRepl(items);

  if (result.action === 'select') {
    if (result.item.type === 'entity') {
      await showEntity(db, result.item.id);
    } else {
      // Show document content
      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.item.id) as any;
      if (doc) {
        console.log(`\n--- ${doc.file_path || '(entry)'} ---`);
        if (doc.kind === 'file' && doc.file_path) {
          const config = await loadConfig();
          const fullPath = path.join(config.vault.path, doc.file_path);
          try {
            console.log(fs.readFileSync(fullPath, 'utf-8'));
          } catch {
            console.log(doc.extracted_text || '(no content)');
          }
        } else {
          console.log(doc.content || '(no content)');
        }
      }
    }
  }
}

export const entityCommand = new Command('entity')
  .description('Browse an entity and its connections')
  .argument('<name-or-id>', 'Entity name or ID to browse')
  .action(async (nameOrId: string) => {
    const config = await loadConfig();
    const db = getDb(config);

    // Try exact lookup first
    let entity = getEntityByNameOrId(db, nameOrId);

    if (!entity) {
      // Try fuzzy search
      const results = searchEntities(db, nameOrId);
      if (results.length === 0) {
        console.log(`No entity found matching "${nameOrId}"`);
        return;
      }
      if (results.length === 1) {
        entity = results[0];
      } else {
        // Multiple matches — let user pick
        console.log(`Multiple matches for "${nameOrId}":`);
        const pickItems: NavigationItem[] = results.map(e => ({
          type: 'entity' as const,
          id: e.id,
          label: `${e.name} (${e.type})`,
        }));
        const pick = await navigationRepl(pickItems, 'Pick one: enter number, or (q)uit');
        if (pick.action === 'select') {
          entity = results.find(e => e.id === pick.item.id);
        } else {
          return;
        }
      }
    }

    if (entity) {
      await showEntity(db, entity.id);
    }
  });