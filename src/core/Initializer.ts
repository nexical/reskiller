import { ReskillConfig } from '../config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSymlinks } from './Symlinker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Initializer {
  static initialize(
    config: ReskillConfig,
    rootDir: string,
    // Dependency injection for testing
    ensureSymlinksFn: (config: ReskillConfig) => void = ensureSymlinks,
  ) {
    // Resolve paths relative to project root
    const skillsDir = path.resolve(rootDir, config.skillsDir);
    const userPromptsDir = path.resolve(rootDir, '.reskiller/prompts');

    // 1. Create skills directory
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }

    // 2. Create prompts directory and copy defaults
    if (!fs.existsSync(userPromptsDir)) {
      fs.mkdirSync(userPromptsDir, { recursive: true });
    }

    const sourcePrompts = path.resolve(__dirname, '../../prompts');

    if (fs.existsSync(sourcePrompts)) {
      const isEmpty = fs.readdirSync(userPromptsDir).length === 0;
      if (isEmpty) {
        fs.cpSync(sourcePrompts, userPromptsDir, { recursive: true });
      }
    }

    // Cleanup legacy "agents" subdirectory if it exists (in the new location)
    const legacyAgentsDir = path.join(userPromptsDir, 'agents');
    if (fs.existsSync(legacyAgentsDir)) {
      fs.rmSync(legacyAgentsDir, { recursive: true, force: true });
    }

    // 3. Ensure Symlinks
    ensureSymlinksFn(config);
  }
}
