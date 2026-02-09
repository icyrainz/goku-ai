import * as readline from 'node:readline';

export interface NavigationItem {
  type: 'entity' | 'document';
  id: string;
  label: string;  // Display text shown in the numbered list
}

/**
 * Display a list of numbered items, then read user input in a loop.
 * Returns the selected NavigationItem, or a special action.
 */
export async function navigationRepl(
  items: NavigationItem[],
  prompt: string = 'Navigate: enter number, or (s)earch, (b)ack, (q)uit'
): Promise<{ action: 'select'; item: NavigationItem } | { action: 'search' } | { action: 'back' } | { action: 'quit' }> {
  // Display numbered items
  for (let i = 0; i < items.length; i++) {
    console.log(`  [${i + 1}] ${items[i].label}`);
  }

  console.log(`\n${prompt}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === 'q' || trimmed === 'quit') {
        resolve({ action: 'quit' });
      } else if (trimmed === 'b' || trimmed === 'back') {
        resolve({ action: 'back' });
      } else if (trimmed === 's' || trimmed === 'search') {
        resolve({ action: 'search' });
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= items.length) {
          resolve({ action: 'select', item: items[num - 1] });
        } else {
          console.log('Invalid input.');
          resolve({ action: 'quit' });
        }
      }
    });
  });
}