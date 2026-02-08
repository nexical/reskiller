#!/usr/bin/env -S npx tsx
/* eslint-disable */

import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { spawn, execSync } from 'node:child_process';
import minimist from 'minimist';
import readline from 'node:readline';

const PROMPTS_DIR = path.join(__dirname, '../../prompts');

// Helper to run Gemini with a specific model
// Returns 0 on success, or throws error if failed (unless it's a 429)
// If it's a 429, returns { retry: true }
interface GeminiResult {
  code: number;
  shouldRetry: boolean;
  output: string;
}

function runGemini(model: string, input: string): Promise<GeminiResult> {
  return new Promise((resolve) => {
    console.log(`[Agent] Attempting with model: \x1b[36m${model}\x1b[0m...`);

    // [DEP0190] Fix: Pass arguments as part of the command string when shell: true
    const start = Date.now();
    const child = spawn(`gemini --yolo --model ${model}`, {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'], // Capture stdout/stderr
    });

    let stdoutData = '';
    let stderrData = '';

    // Stream stdout to user and capture
    child.stdout?.on('data', (data) => {
      const chunk = data.toString();
      process.stdout.write(chunk);
      stdoutData += chunk;
    });

    // Stream stderr to user and capture
    child.stderr?.on('data', (data) => {
      const chunk = data.toString();
      process.stderr.write(chunk); // Passthrough to user
      stderrData += chunk;
    });

    child.stdin.write(input);
    child.stdin.end();

    child.on('close', (code) => {
      const duration = Date.now() - start;
      const exitCode = code ?? 1;

      // Check for capacity exhaustion
      const isExhausted =
        stderrData.includes('429') ||
        stderrData.includes('exhausted your capacity') ||
        stderrData.includes('ResourceExhausted');

      if (exitCode !== 0 && isExhausted) {
        console.warn(
          `[Agent] \u26A0\ufe0f Model ${model} exhausted (429). Duration: ${duration}ms`,
        );
        resolve({ code: exitCode, shouldRetry: true, output: stdoutData });
      } else {
        resolve({ code: exitCode, shouldRetry: false, output: stdoutData });
      }
    });

    child.on('error', (err) => {
      console.error(`[Agent] Failed to spawn Gemini (${model}):`, err);
      resolve({ code: 1, shouldRetry: false, output: '' });
    });
  });
}

async function main() {
  // Parse args
  const argv = minimist(process.argv.slice(2));
  const promptName = argv._[0];

  // Help / Usage
  if (!promptName || argv.help || argv.h) {
    console.log(`
Usage: npx prompt <prompt-name> [options]

Arguments:
  prompt-name   The name of the markdown file in the 'prompts' directory.

Options:
  --help, -h    Show this help message.
  ...flags      Any other flags are passed as variables to the template.

Examples:
  npx prompt auditor --target=src/foo.ts
`);
    process.exit(0);
  }

  // Resolve prompt file
  const promptFile = path.join(
    PROMPTS_DIR,
    promptName.endsWith('.md') ? promptName : `${promptName}.md`,
  );

  try {
    await fs.access(promptFile);
  } catch (error) {
    console.error(`Error: Prompt file not found: ${promptFile}`);
    process.exit(1);
  }

  // Configure Nunjucks
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(PROMPTS_DIR), {
    autoescape: false,
    trimBlocks: true,
    lstripBlocks: true,
  });

  // Helper: context(path) -> runs repomix
  env.addGlobal('context', (targetPath: string) => {
    try {
      console.log(`[Context] Analyzing codebase at: ${targetPath}`);
      const output = execSync(
        `npx -y repomix --stdout --quiet --style xml --include "${targetPath}/**/*" --ignore "**/node_modules,**/dist"`,
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] },
      );
      return `<CODEBASE_CONTEXT path="${targetPath}">\n${output}\n</CODEBASE_CONTEXT>`;
    } catch (error) {
      console.error(`[Context] Error running repomix on ${targetPath}`);
      return `[Error generating context for ${targetPath}]`;
    }
  });

  // Helper: read(path) -> reads local file
  env.addGlobal('read', (relativePath: string) => {
    try {
      const resolvedPath = path.resolve(process.cwd(), relativePath);
      const content = readFileSync(resolvedPath, 'utf-8');
      return content;
    } catch (error) {
      console.error(`[Read] Error reading file: ${relativePath}`);
      return `[Error reading file ${relativePath}]`;
    }
  });

  // Read template content
  let templateContent: string;
  try {
    templateContent = await fs.readFile(promptFile, 'utf-8');
  } catch (error) {
    console.error(`Error reading prompt file: ${error}`);
    process.exit(1);
  }

  // Render template
  console.log(`[Render] Rendering template with variables:`, JSON.stringify(argv, null, 2));
  const renderedPrompt = env.renderString(templateContent, {
    ...argv,
  });

  // Buffer to file
  const tempFile = path.join(os.tmpdir(), '.temp_prompt_active.md');
  await fs.writeFile(tempFile, renderedPrompt, 'utf-8');
  console.log(`[Buffer] Wrote active prompt to ${tempFile}`);

  // Parse models
  const defaultModel = 'gemini-3-flash-preview,gemini-3-pro-preview';
  const modelsArg = argv.models || defaultModel;
  const models = modelsArg
    .split(',')
    .map((m: string) => m.trim())
    .filter(Boolean);

  console.log(`[Agent] Model rotation strategy: [${models.join(', ')}]`);

  let currentPrompt = renderedPrompt;
  let finalCode = 0;

  while (true) {
    let success = false;
    let lastOutput = '';

    for (const model of models) {
      const result = await runGemini(model, currentPrompt);

      if (result.code === 0) {
        success = true;
        lastOutput = result.output;
        break;
      }

      if (result.shouldRetry) {
        console.log(`[Agent] Switching to next model...`);
        continue; // Try next model
      } else {
        // Non-retriable error
        finalCode = result.code;
        break;
      }
    }

    if (!success) {
      if (finalCode === 0) finalCode = 1;
      console.error(`[Agent] \u274C All attempts failed.`);
      break;
    }

    // If not interactive, we are done
    if (!argv.interactive) {
      break;
    }

    // Append model output to history
    // We assume the model output is the "answer"
    currentPrompt += `\n${lastOutput}`;

    // Helper for readline
    const askLink = () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      return new Promise<string>((resolve) => {
        console.log('\n(Type "exit" or "quit" to end the session)');
        rl.question('> ', (ans) => {
          rl.close();
          resolve(ans);
        });
      });
    };

    const answer = await askLink();

    // If user presses enter without text, we could stop or just continue?
    // Let's assume empty line = stop for now, or just send empty?
    // Standard chat CLI behavior: empty line might just be newline.
    // But we need a way to stop.
    // If output ended with a bash block, maybe we don't need to continue?
    // Let's check for "exit" or "quit"
    if (['exit', 'quit'].includes(answer.trim().toLowerCase())) {
      break;
    }

    // Append user input
    currentPrompt += `\nUser: ${answer}\n`;
  }

  try {
    await fs.unlink(tempFile);
    console.log(`[Cleanup] Removed active prompt file`);
  } catch {
    // ignore cleanup errors
  }

  process.exit(finalCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
