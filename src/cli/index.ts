import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { initCommand } from './init.js';
import { statusCommand } from './status.js';
import { addCommand } from './add.js';
import { scanCommand } from './scan.js';
import { processCommand } from './process.js';
import { entityCommand } from './entity.js';
import { askCommand } from './ask.js';
import { importCommand } from './import.js';
import { rebuildCommand } from './rebuild.js';

const program = new Command();

program
  .name('note')
  .description('AI-powered personal knowledge graph over your files')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(statusCommand);
program.addCommand(addCommand);
program.addCommand(scanCommand);
program.addCommand(processCommand);
program.addCommand(entityCommand);
program.addCommand(askCommand);
program.addCommand(importCommand);
program.addCommand(rebuildCommand);

program.parse();

const config = loadConfig();
console.log('Loaded config:', JSON.stringify(config, null, 2));