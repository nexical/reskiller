#!/usr/bin/env node

import { CLI } from '@nexical/cli-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const commandName = 'reskill';
  const coreCommandsDir = path.resolve(__dirname, './commands');

  const app = new CLI({
    version: pkg.version,
    commandName: commandName,
    searchDirectories: [coreCommandsDir],
  });

  app.start();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
