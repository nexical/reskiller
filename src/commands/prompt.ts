import { BaseCommand, type CommandDefinition } from '@nexical/cli-core';
import fs from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { spawn, execSync } from 'node:child_process';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, '../../prompts');

interface GeminiResult {
  code: number;
  shouldRetry: boolean;
  output: string;
}

export default class PromptCommand extends BaseCommand {
  static description = 'Run an AI prompt against the codebase';

  static args: CommandDefinition = {
    args: [
      {
        name: 'promptName',
        description: "The name of the markdown file in the 'prompts' directory.",
        required: true,
      },
    ],
    options: [
      {
        name: '--models <models>',
        description: 'Comma-separated list of models to use (rotation strategy)',
        default: 'gemini-3-flash-preview,gemini-3-pro-preview',
      },
      {
        name: '--interactive',
        description: 'Enable interactive mode',
        default: false,
      },
      // Note: extra flags are passed as options to the command, and we can access them in run()
    ],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async run(options: any) {
    const { promptName, models: modelsArg, interactive, ...rest } = options;
    const argv = { ...options, ...rest }; // Pass all options as variables

    const fileName = promptName.endsWith('.md') ? promptName : `${promptName}.md`;

    // 1. Check User Override
    let promptFile = path.join(process.cwd(), '.agent/prompts', fileName);
    let usingOverride = false;

    try {
      await fs.access(promptFile);
      this.info(`[Agent] Using user override: ${promptFile}`);
      usingOverride = true;
    } catch {
      // Fallback to package prompts
      // In dev: packages/reskill/src/commands/prompt.ts -> packages/reskill/prompts
      // Path logic might differ if run from dist.
      // PROMPTS_DIR is calculated relative to __dirname.

      // Let's refine PROMPTS_DIR search similar to init command logic if needed,
      // but simpler to just try the constant first.
      promptFile = path.join(PROMPTS_DIR, fileName);

      // If PROMPTS_DIR doesn't exist, maybe we are in dist?
      if (!existsSync(PROMPTS_DIR)) {
        // try dist/../prompts ??
        // if __dirname is dist/commands, then ../../prompts is dist/prompts.
        // That should be correct if we copy prompts to dist.
      }

      try {
        await fs.access(promptFile);
      } catch {
        this.error(
          `Error: Prompt file not found in:\n- ${path.join(process.cwd(), '.agent/prompts', fileName)}\n- ${promptFile}`,
        );
        process.exit(1);
      }
    }

    // Prepare Nunjucks
    // Use the directory of the found prompt file as the loader root?
    // Or PROMPTS_DIR?
    // If using user override, we might want to allow including other user prompts?
    // For now, let's keep it simple and use PROMPTS_DIR as base, unless override.

    const loaderPath = usingOverride ? path.dirname(promptFile) : PROMPTS_DIR;

    // If using override, we still might want access to base prompts/macros if we had any.
    // But let's stick to the file's directory.

    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(loaderPath), {
      autoescape: false,
      trimBlocks: true,
      lstripBlocks: true,
    });

    env.addGlobal('context', (targetPath: string) => {
      try {
        this.info(`[Context] Analyzing codebase at: ${targetPath}`);
        const output = execSync(
          `npx -y repomix --stdout --quiet --style xml --include "${targetPath}/**/*" --ignore "**/node_modules,**/dist"`,
          { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] },
        );
        return `<CODEBASE_CONTEXT path="${targetPath}">\n${output}\n</CODEBASE_CONTEXT>`;
      } catch {
        this.error(`[Context] Error running repomix on ${targetPath}`);
        return `[Error generating context for ${targetPath}]`;
      }
    });

    env.addGlobal('read', (relativePath: string) => {
      try {
        const resolvedPath = path.resolve(process.cwd(), relativePath);
        const content = readFileSync(resolvedPath, 'utf-8');
        return content;
      } catch {
        this.error(`[Read] Error reading file: ${relativePath}`);
        return `[Error reading file ${relativePath}]`;
      }
    });

    let templateContent: string;
    try {
      templateContent = await fs.readFile(promptFile, 'utf-8');
    } catch (error) {
      this.error(
        `Error reading prompt file: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }

    this.info(`[Render] Rendering template with variables: ${JSON.stringify(argv, null, 2)}`);

    let renderedPrompt: string;
    try {
      renderedPrompt = env.renderString(templateContent, {
        ...argv,
      });
    } catch (e) {
      this.error(`Template render error: ${e}`);
      process.exit(1);
    }

    const tempFile = path.join(os.tmpdir(), '.temp_prompt_active.md');
    await fs.writeFile(tempFile, renderedPrompt, 'utf-8');
    this.info(`[Buffer] Wrote active prompt to ${tempFile}`);

    const models = modelsArg
      .split(',')
      .map((m: string) => m.trim())
      .filter(Boolean);

    this.info(`[Agent] Model rotation strategy: [${models.join(', ')}]`);

    let currentPrompt = renderedPrompt;
    let finalCode = 0;

    // Loop for retries/interactive
    while (true) {
      let success = false;
      let lastOutput = '';

      for (const model of models) {
        const result = await this.runGemini(model, currentPrompt);

        if (result.code === 0) {
          success = true;
          lastOutput = result.output;
          break;
        }

        if (result.shouldRetry) {
          this.info(`[Agent] Switching to next model...`);
          continue;
        } else {
          finalCode = result.code;
          break;
        }
      }

      if (!success) {
        if (finalCode === 0) finalCode = 1;
        this.error(`[Agent] \u274C All attempts failed.`);
        break;
      }

      if (!interactive) {
        break;
      }

      currentPrompt += `\n${lastOutput}`;

      const answer = await this.askLink();

      if (['exit', 'quit'].includes(answer.trim().toLowerCase())) {
        break;
      }
      currentPrompt += `\nUser: ${answer}\n`;
    }

    try {
      await fs.unlink(tempFile);
      this.info(`[Cleanup] Removed active prompt file`);
    } catch {
      // ignore
    }

    if (finalCode !== 0) {
      process.exit(finalCode);
    }
  }

  private runGemini(model: string, input: string): Promise<GeminiResult> {
    return new Promise((resolve) => {
      this.info(`[Agent] Attempting with model: \x1b[36m${model}\x1b[0m...`);
      const start = Date.now();

      const child = spawn(`gemini --yolo --model ${model}`, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdoutData = '';
      let stderrData = '';

      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        process.stdout.write(chunk);
        stdoutData += chunk;
      });

      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        process.stderr.write(chunk);
        stderrData += chunk;
      });

      child.stdin.write(input);
      child.stdin.end();

      child.on('close', (code) => {
        const duration = Date.now() - start;
        const exitCode = code ?? 1;
        const isExhausted =
          stderrData.includes('429') ||
          stderrData.includes('exhausted your capacity') ||
          stderrData.includes('ResourceExhausted');

        if (exitCode !== 0 && isExhausted) {
          this.warn(`[Agent] \u26A0\ufe0f Model ${model} exhausted (429). Duration: ${duration}ms`);
          resolve({ code: exitCode, shouldRetry: true, output: stdoutData });
        } else {
          resolve({ code: exitCode, shouldRetry: false, output: stdoutData });
        }
      });

      child.on('error', (err) => {
        this.error(
          `[Agent] Failed to spawn Gemini (${model}): ${err instanceof Error ? err.message : String(err)}`,
        );
        resolve({ code: 1, shouldRetry: false, output: '' });
      });
    });
  }

  private askLink(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise<string>((resolve) => {
      this.info('\n(Type "exit" or "quit" to end the session)');
      rl.question('> ', (ans) => {
        rl.close();
        resolve(ans);
      });
    });
  }
}
