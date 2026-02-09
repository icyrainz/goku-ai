import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';
import { askQuestion } from '../llm/ask.js';
import { navigationRepl, NavigationItem } from './repl.js';

export const askCommand = new Command('ask')
  .description('Ask a question answered from the knowledge graph')
  .argument('<question>', 'your question')
  .action(async (question: string) => {
    const config = loadConfig();
    const db = getDb(config);

    console.log('Thinking...\n');

    try {
      const result = await askQuestion(config, db, question);

      console.log(result.answer);

      // Show referenced entities as navigation items
      if (result.referencedEntityIds.length > 0) {
        console.log('\nReferenced entities:');
        const items: NavigationItem[] = [];

        for (const entityId of result.referencedEntityIds) {
          const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(entityId) as any;
          if (entity) {
            items.push({
              type: 'entity',
              id: entity.id,
              label: `${entity.name} (${entity.type})`,
            });
          }
        }

        if (items.length > 0) {
          const nav = await navigationRepl(items, 'Navigate: enter number, or (q)uit');
          if (nav.action === 'select') {
            console.log(`\nRun: note entity ${nav.item.id}`);
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${msg}`);
    }
  });