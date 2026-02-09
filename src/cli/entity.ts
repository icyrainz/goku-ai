import { Command } from 'commander';
import { getDb } from '../core/db.js';
import { getRelatedEntities } from '../core/entities.js';
import { getDocumentsForEntity } from '../core/entities.js';
import { loadConfig } from '../config.js';

export const entityCommand = new Command('entity')
  .description('Browse an entity and its connections')
  .argument('<name-or-id>', 'Entity name or ID to browse')
  .action(async (nameOrId: string) => {
    const config = await loadConfig();
    const db = getDb(config);
    
    // Try to find entity by ID or name
    let entityRow = db.prepare('SELECT * FROM entities WHERE id = ?').get(nameOrId);
    if (!entityRow) {
      // Try case-insensitive name match
      const entityRowCI = db.prepare('SELECT * FROM entities WHERE LOWER(name) = LOWER(?)').get(nameOrId);
      if (!entityRowCI) {
        console.error(`Entity not found: ${nameOrId}`);
        return;
      }
      entityRow = entityRowCI as any;
    }

    const entity = entityRow as { name: string; type: string; aliases: string; id: string };
    console.log(`🏷️  ${entity.name} (${entity.type})`);
    console.log('─'.repeat(40));

    // Get related entities and documents
    const related = getRelatedEntities(db, entity.id);
    const docs = getDocumentsForEntity(db, entity.id);

    // Show related entities
    if (related.length > 0) {
      console.log('\nRelated Entities:');
      related.forEach((rel, i) => {
        const relStr = `${i + 1}. ${rel.entity.name} (${rel.entity.type}) ← ${rel.relationshipType}`;
        console.log(relStr);
      });
    } else {
      console.log('\nNo related entities found.');
    }

    // Show documents
    if (docs.length > 0) {
      console.log('\nFound In Documents:');
      docs.forEach((doc, i) => {
        const docStr = `${i + 1}. ${doc.file_path || '(unknown)'} – ${doc.title || doc.name}`;
        console.log(`   ${i + 1}. ${docStr}`);
      });
    } else {
      console.log('\nNot found in any documents.');
    }
  });