import { BaseCommand } from '@nexical/cli-core';
import inquirer from 'inquirer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class InitCommand extends BaseCommand {
  static description = 'Initialize Reskill in the current directory';

  async run() {
    this.info("🤖 Welcome to Reskill! Let's get you set up.\n");

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'skillsDir',
        message: 'Where do you want to store global skills?',
        default: 'skills',
      },
      {
        type: 'input',
        name: 'archDoc',
        message: 'Path to your Architecture Documentation?',
        default: 'core/ARCHITECTURE.md',
      },
      {
        type: 'checkbox',
        name: 'symlinks',
        message: 'Create symlinks for other agents?',
        choices: [
          { name: 'VS Code / General (.vscode/skills)', value: '.vscode/skills' },
          { name: 'Cursor (.cursor/rules)', value: '.cursor/rules' },
          {
            name: 'GitHub Copilot (.github/copilot-instructions.md - folder)',
            value: '.github/copilot-instructions.md',
          },
        ],
      },
    ]);

    const config = {
      skillsDir: answers.skillsDir,
      constitution: {
        architecture: answers.archDoc,
        patterns: 'core/MODULES.md',
      },
      discovery: {
        root: '.',
        markers: ['.skills'],
        ignore: ['node_modules', 'dist', '.git'],
        depth: 5,
      },
      outputs: {
        contextFiles: ['GEMINI.md', '.cursorrules'],
        symlinks: answers.symlinks || [],
      },
    };

    fs.writeFileSync('reskill.config.json', JSON.stringify(config, null, 2));
    this.success('\n✅ Created reskill.config.json');

    // Create skills directory
    if (!fs.existsSync(answers.skillsDir)) {
      fs.mkdirSync(answers.skillsDir, { recursive: true });
      this.success(`✅ Created ${answers.skillsDir}`);
    }

    // Copy prompts
    const userPromptsDir = '.agent/prompts';
    if (!fs.existsSync(userPromptsDir)) {
      fs.mkdirSync(userPromptsDir, { recursive: true });
    }

    // Locate source prompts
    // From src/commands/skill/init.ts or dist/commands/skill/init.js,
    // prompts are 3 levels up.
    const sourcePrompts = path.join(__dirname, '../../../prompts');

    if (fs.existsSync(sourcePrompts)) {
      fs.cpSync(sourcePrompts, userPromptsDir, { recursive: true });
      this.success(`✅ Copied default prompts to ${userPromptsDir}`);
    } else {
      this.warn(
        `⚠️ Could not find default prompts at ${sourcePrompts}. You may need to copy them manually.`,
      );
    }

    this.success('\n🎉 Setup complete! Run "reskill evolve" to start.');
  }
}
