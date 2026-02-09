import { Command } from 'commander';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { convertGoogleKeep } from '../import/google-keep.js';
import { importDailyNotes } from '../import/daily-notes.js';

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

importCommand
  .command('daily-notes')
  .description('Import daily note markdown files (YYYY-MM-DD.md) into vault')
  .argument('<path>', 'directory containing daily note .md files')
  .action((notesPath: string) => {
    const config = loadConfig();
    const resolved = path.resolve(notesPath);

    console.log(`Importing daily notes from ${resolved}...`);
    const result = importDailyNotes(resolved, config.vault.path);

    console.log(`Copied ${result.imported} files to vault/daily/`);
    if (result.skipped > 0) {
      console.log(`Skipped ${result.skipped} (duplicates, empty, or invalid filenames)`);
    }
    for (const err of result.errors) {
      console.log(`  ⚠ ${err}`);
    }
    if (result.imported > 0) {
      console.log(`Run \`note scan\` to index them.`);
    }
  });

export { importCommand };