import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';

export const initCommand = new Command('init')
  .description('Initialize a vault directory')
  .argument('[path]', 'vault directory path', '~/notes')
  .action((vaultPath: string) => {
    // Expand ~
    const resolved = vaultPath.startsWith('~')
      ? path.join(os.homedir(), vaultPath.slice(1))
      : path.resolve(vaultPath);

    // Create vault directory
    fs.mkdirSync(resolved, { recursive: true });

    // Create .note-taker subdirectory
    fs.mkdirSync(path.join(resolved, '.note-taker'), { recursive: true });

    // Load config with overridden vault path, initialize DB
    const config = loadConfig();
    config.vault.path = resolved;
    getDb(config);

    // Write config file with updated vault path (overwrites any existing config)
    const configDir = path.join(os.homedir(), '.config', 'note-taker');
    const configPath = path.join(configDir, 'config.toml');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, `[vault]\npath = "${resolved}"\n\n[llm]\nbase_url = "http://localhost:11434/v1"\nmodel = "mistral"\napi_key = ""\n`);

    console.log(`Vault initialized at ${resolved}`);
  });