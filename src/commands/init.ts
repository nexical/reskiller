import inquirer from 'inquirer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initCommand() {
  console.info("🤖 Welcome to Reskill! Let's get you set up.\n");

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'platformPath',
      message: 'Where is your core library code (Kernel)?',
      default: 'core/src',
    },
    {
      type: 'input',
      name: 'modulePatterns',
      message: 'Where should we look for modules (User Space)? (comma separated globs)',
      default: 'apps/*/modules',
    },
    {
      type: 'input',
      name: 'skillsDir',
      message: 'Where do you want to store skills?',
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
      patterns: 'core/MODULES.md', // Default, maybe ask?
    },
    input: {
      platformDirs: [{ name: 'core', path: answers.platformPath }],
      moduleDirs: answers.modulePatterns.split(',').map((s: string) => s.trim()),
    },
    outputs: {
      contextFiles: ['GEMINI.md', '.cursorrules'],
      symlinks: answers.symlinks || [],
    },
  };

  fs.writeFileSync('reskill.config.json', JSON.stringify(config, null, 2));
  console.info('\n✅ Created reskill.config.json');

  // Create skills directory
  if (!fs.existsSync(answers.skillsDir)) {
    fs.mkdirSync(answers.skillsDir, { recursive: true });
    console.info(`✅ Created ${answers.skillsDir}`);
  }

  // Copy prompts
  const userPromptsDir = '.agent/prompts';
  if (!fs.existsSync(userPromptsDir)) {
    fs.mkdirSync(userPromptsDir, { recursive: true });
  }

  // Locate source prompts
  // In dev: packages/reskill/src/commands/init.ts -> packages/reskill/prompts
  // In dist: packages/reskill/dist/commands/init.js -> packages/reskill/dist/prompts

  // We need to be careful about where we are.
  // Assuming standard layout:
  // src/commands/init.ts
  // prompts/

  // validation of path
  let sourcePrompts = path.join(__dirname, '../../../prompts'); // dev
  if (!fs.existsSync(sourcePrompts)) {
    // try dist layout
    sourcePrompts = path.join(__dirname, '../../prompts');
  }

  if (fs.existsSync(sourcePrompts)) {
    fs.cpSync(sourcePrompts, userPromptsDir, { recursive: true });
    console.info(`✅ Copied default prompts to ${userPromptsDir}`);
  } else {
    console.warn(
      `⚠️ Could not find default prompts at ${sourcePrompts}. You may need to copy them manually.`,
    );
  }

  console.info('\n🎉 Setup complete! Run "reskill evolve" to start.');
}
