import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';
import { scanVault } from './scan.js';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'untitled';
}

export const quickCommand = new Command('quick')
  .description('Create a one-off note in vault/quick/')
  .action(async () => {
    const config = loadConfig();

    const tmpFile = path.join(os.tmpdir(), `note-${Date.now()}.md`);
    const date = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(tmpFile, `---\ndate: ${date}\n---\n\n`);

    const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
    const result = spawnSync(editor, [tmpFile], { stdio: 'inherit' });

    if (result.status !== 0) {
      console.error('Editor exited with error');
      fs.unlinkSync(tmpFile);
      return;
    }

    const content = fs.readFileSync(tmpFile, 'utf-8').trim();
    fs.unlinkSync(tmpFile);

    if (!content || content === `---\ndate: ${date}\n---`) {
      console.log('Empty note, nothing saved.');
      return;
    }

    const quickDir = path.join(config.vault.path, 'quick');
    fs.mkdirSync(quickDir, { recursive: true });

    const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('---') && !l.match(/^\w+:/))?.trim();
    const slug = firstLine ? slugify(firstLine) : 'untitled';
    const filePath = path.join(quickDir, `${timestamp()}-${slug}.md`);

    fs.writeFileSync(filePath, content);
    console.log(`Saved ${filePath}`);

    const db = getDb(config);
    await scanVault(config, db);
  });
