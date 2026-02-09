import { Command } from 'commander';
import { initCommand } from './init.js';
import { statusCommand } from './status.js';
import { dailyCommand } from './daily.js';
import { quickCommand } from './quick.js';
import { scanCommand } from './scan.js';
import { processCommand } from './process.js';
import { entityCommand } from './entity.js';
import { searchCommand } from './search.js';
import { askCommand } from './ask.js';
import { importCommand } from './import.js';
import { rebuildCommand } from './rebuild.js';
import { todayCommand } from './today.js';

const program = new Command();

program
  .name('note')
  .description('AI-powered personal knowledge graph over your files')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(statusCommand);
program.addCommand(dailyCommand);
program.addCommand(quickCommand);
program.addCommand(scanCommand);
program.addCommand(processCommand);
program.addCommand(entityCommand);
program.addCommand(searchCommand);
program.addCommand(askCommand);
program.addCommand(importCommand);
program.addCommand(rebuildCommand);
program.addCommand(todayCommand);

program.parse();