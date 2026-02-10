import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { spawn, execSync } from 'node:child_process';
import minimist from 'minimist';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, '../../prompts');

interface GeminiResult {
  code: number;
  shouldRetry: boolean;
  output: string;
}

export class PromptRunner {
  // Allow injection of dependencies for testing
  constructor(
    private dependencies: {
      log: (msg: string, ...args: unknown[]) => void;
      error: (msg: string, ...args: unknown[]) => void;
      warn: (msg: string, ...args: unknown[]) => void;
      // spawn and execSync are harder to inject properly without an adapter,
      // but we can mock child_process module in tests.
    } = {
      log: console.info,
      error: console.error,
      warn: console.warn,
    },
  ) {}

  async run(args: string[]): Promise<number> {
    const argv = minimist(args);
    const promptName = argv._[0];

    if (!promptName || argv.help || argv.h) {
      this.dependencies.log(`
Usage: npx prompt <prompt-name> [options]

Arguments:
  prompt-name   The name of the markdown file in the 'prompts' directory.

Options:
  --help, -h    Show this help message.
  ...flags      Any other flags are passed as variables to the template.

Examples:
  npx prompt auditor --target=src/foo.ts
`);
      return 0;
    }

    const fileName = promptName.endsWith('.md') ? promptName : `${promptName}.md`;

    // 1. Check User Override
    // In tests process.cwd() might be different, so we should allow cwd injection or use process.cwd()
    let promptFile = path.join(process.cwd(), '.agent/prompts', fileName);

    try {
      await fs.access(promptFile);
      this.dependencies.log(`[Agent] Using user override: ${promptFile}`);
    } catch {
      promptFile = path.join(PROMPTS_DIR, fileName);
      try {
        await fs.access(promptFile);
      } catch {
        this.dependencies.error(
          `Error: Prompt file not found in:\n- ${path.join(process.cwd(), '.agent/prompts', fileName)}\n- ${promptFile}`,
        );
        return 1;
      }
    }

    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(PROMPTS_DIR), {
      autoescape: false,
      trimBlocks: true,
      lstripBlocks: true,
    });

    env.addGlobal('context', (targetPath: string) => {
      try {
        this.dependencies.log(`[Context] Analyzing codebase at: ${targetPath}`);
        const output = execSync(
          `npx -y repomix --stdout --quiet --style xml --include "${targetPath}/**/*" --ignore "**/node_modules,**/dist"`,
          { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] },
        );
        return `<CODEBASE_CONTEXT path="${targetPath}">\n${output}\n</CODEBASE_CONTEXT>`;
      } catch {
        this.dependencies.error(`[Context] Error running repomix on ${targetPath}`);
        return `[Error generating context for ${targetPath}]`;
      }
    });

    env.addGlobal('read', (relativePath: string) => {
      try {
        const resolvedPath = path.resolve(process.cwd(), relativePath);
        const content = readFileSync(resolvedPath, 'utf-8');
        return content;
      } catch {
        this.dependencies.error(`[Read] Error reading file: ${relativePath}`);
        return `[Error reading file ${relativePath}]`;
      }
    });

    let templateContent: string;
    try {
      templateContent = await fs.readFile(promptFile, 'utf-8');
    } catch (error) {
      this.dependencies.error(
        `Error reading prompt file: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 1;
    }

    this.dependencies.log(
      `[Render] Rendering template with variables:`,
      JSON.stringify(argv, null, 2),
    );
    const renderedPrompt = env.renderString(templateContent, {
      ...argv,
    });

    const tempFile = path.join(os.tmpdir(), '.temp_prompt_active.md');
    await fs.writeFile(tempFile, renderedPrompt, 'utf-8');
    this.dependencies.log(`[Buffer] Wrote active prompt to ${tempFile}`);

    const defaultModel = 'gemini-3-flash-preview,gemini-3-pro-preview';
    const modelsArg = argv.models || defaultModel;
    const models = modelsArg
      .split(',')
      .map((m: string) => m.trim())
      .filter(Boolean);

    this.dependencies.log(`[Agent] Model rotation strategy: [${models.join(', ')}]`);

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
          this.dependencies.log(`[Agent] Switching to next model...`);
          continue;
        } else {
          finalCode = result.code;
          break;
        }
      }

      if (!success) {
        if (finalCode === 0) finalCode = 1;
        this.dependencies.error(`[Agent] \u274C All attempts failed.`);
        break;
      }

      if (!argv.interactive) {
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
      this.dependencies.log(`[Cleanup] Removed active prompt file`);
    } catch {
      // ignore
    }

    return finalCode;
  }

  private runGemini(model: string, input: string): Promise<GeminiResult> {
    return new Promise((resolve) => {
      this.dependencies.log(`[Agent] Attempting with model: \x1b[36m${model}\x1b[0m...`);
      const start = Date.now();

      // spawn is mocked in tests
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
          this.dependencies.warn(
            `[Agent] \u26A0\ufe0f Model ${model} exhausted (429). Duration: ${duration}ms`,
          );
          resolve({ code: exitCode, shouldRetry: true, output: stdoutData });
        } else {
          resolve({ code: exitCode, shouldRetry: false, output: stdoutData });
        }
      });

      child.on('error', (err) => {
        this.dependencies.error(
          `[Agent] Failed to spawn Gemini (${model}):`,
          err instanceof Error ? err.message : String(err),
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
      this.dependencies.log('\n(Type "exit" or "quit" to end the session)');
      rl.question('> ', (ans) => {
        rl.close();
        resolve(ans);
      });
    });
  }
}
