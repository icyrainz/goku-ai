import { Command } from 'commander';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { convertGoogleKeep } from '../import/google-keep.js';

const importCommand = new Command('import')
  .description('Import external data into the vault');

importCommand
  .command('google-keep')
  .description('Convert Google Keep Takeout export into vault markdown files')
  .argument('<path>', 'path to Google Takeout Keep directory')
  .action((keepPath: string) => {
    const config = loadConfig();
    const resolved = path.resolve(keepPath);

    console.log(`Converting Google Keep notes from ${resolved}...`);
    const result = convertGoogleKeep(resolved, config.vault.path);

    console.log(`Created ${result.created} files in vault/keep/`);
    if (result.skipped > 0) {
      console.log(`Skipped ${result.skipped} (trashed, duplicates, or parse errors)`);
    }
    console.log(`Run \`note scan\` to index them.`);
  });

export { importCommand };