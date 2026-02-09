import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';
import { scanVault } from './scan.js';

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureDailyFile(vaultPath: string, date: string): string {
  const dailyDir = path.join(vaultPath, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });

  const filePath = path.join(dailyDir, `${date}.md`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `---\ndate: ${date}\n---\n\n`);
  }
  return filePath;
}

export const dailyCommand = new Command('daily')
  .description('Open today\'s daily note for editing (one file per day)')
  .argument('[date]', 'Date to edit (YYYY-MM-DD), defaults to today')
  .action(async (date?: string) => {
    const config = loadConfig();
    const target = date || todayDate();
    const filePath = ensureDailyFile(config.vault.path, target);

    const hashBefore = fs.readFileSync(filePath, 'utf-8');

    const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
    const result = spawnSync(editor, [filePath], { stdio: 'inherit' });

    if (result.status !== 0) {
      console.error('Editor exited with error');
      return;
    }

    const hashAfter = fs.readFileSync(filePath, 'utf-8');
    if (hashBefore === hashAfter) {
      console.log('No changes.');
      return;
    }

    console.log(`Saved ${filePath}`);
    const db = getDb(config);
    await scanVault(config, db);
  });