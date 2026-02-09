import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';
import { createEntry } from '../core/documents.js';

export const addCommand = new Command('add')
  .description('Add a quick daily entry')
  .action(() => {
    const config = loadConfig();
    const db = getDb(config);

    // Create temp file
    const tmpFile = path.join(os.tmpdir(), `note-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, '');

    // Open editor
    const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
    const result = spawnSync(editor, [tmpFile], { stdio: 'inherit' });

    if (result.status !== 0) {
      console.error('Editor exited with error');
      fs.unlinkSync(tmpFile);
      return;
    }

    // Read content
    const content = fs.readFileSync(tmpFile, 'utf-8').trim();
    fs.unlinkSync(tmpFile);

    if (!content) {
      console.log('Empty entry, nothing saved.');
      return;
    }

    const id = createEntry(db, content);
    console.log(`Entry saved (${id}). Run \`note process\` to extract entities.`);
  });