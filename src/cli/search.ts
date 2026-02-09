import { Command } from 'commander';
import { getDb } from '../core/db.js';
import { searchEntities } from '../core/entities.js';
import { loadConfig } from '../config.js';
import { navigationRepl, NavigationItem } from './repl.js';

export const searchCommand = new Command('search')
  .description('Fuzzy search entities and documents')
  .argument('<query>', 'Search query')
  .action(async (query: string) => {
    const config = await loadConfig();
    const db = getDb(config);
    
    // Search entities
    const entityResults = searchEntities(db, query);
    
    const items: NavigationItem[] = [];
    
    console.log('\nEntity Results:');
    entityResults.forEach((e, i) => {
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
    });
    
    // Simple document search in titles and extracted text
      const docRows = db.prepare('SELECT title, extracted_text FROM documents').all() as any[];
      console.log('\nDocument Results:');
      docRows.forEach((d: any, i) => {
        const preview = d.extracted_text ? d.extracted_text.substring(0, 100) : '(no content)';
        items.push({
          type: 'document',
          id: d.title ? d.title : `doc_${i}`, // Use title or generate ID
          label: `${d.title || '(no title)'}: ${preview}`,
        });
      });
     
     if (items.length === 0) {
       console.log('No results found.');
       return;
     }
 
     // Navigation loop
     const result = await navigationRepl(items);
     if (result.action === 'select') {
       // Handle entity selection
       if (result.item.type === 'entity') {
         // Import entity command dynamically to avoid circular dep
         const { entityCommand } = await import('./entity.js');
         // Just log the entity ID for now, user can run note entity <id>
         console.log(`\nRun: note entity ${result.item.id}`);
       } else if (result.item.type === 'document') {
         // For documents, we could open the document or show content
         // For now, just log a message
         console.log(`\nDocument selected: ${result.item.label}`);
       }
     }
   });