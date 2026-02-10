#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from './config.js';

import { initCommand } from './commands/init.js';
import { watchCommand } from './commands/watch.js';
import { evolveCommand } from './commands/evolve.js';
import { refineCommand } from './commands/refine.js';

const program = new Command();

program.name('reskill').description('Adaptive Learning System for Nexical Skills').version('1.0.0');

program
  .command('init')
  .description('Initialize Reskill in the current directory')
  .action(initCommand);

program
  .command('watch')
  .description('Watch for changes and incrementally refine skills (Pro)')
  .action(watchCommand);

// Load config or exit
try {
  loadConfig();
} catch {
  // Only error if running a command that needs config.
  // We'll handle this check inside actions or just let it fail gracefully if strict.
  // For now, let's allow the CLI to start so help works, but warn.
}

program
  .command('evolve')
  .description('Full cycle: Explore -> Strategize -> Execute')
  .action(evolveCommand);

program
  .command('refine <skillName> <modulePath>')
  .description('Manual single-skill refinement')
  .action(refineCommand);

program.parse();
