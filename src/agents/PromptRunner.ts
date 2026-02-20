import fs from 'node:fs/promises';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { spawn, execSync } from 'node:child_process';
import readline from 'node:readline';
import { logger } from '../core/Logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_PROMPTS_DIR = path.join(__dirname, '../../prompts');

export interface GeminiResult {
  code: number;
  shouldRetry: boolean;
  output: string;
}

export interface PromptOptions {
  promptName: string;
  models?: string;
  interactive?: boolean;
  [key: string]: unknown;
}

export class PromptRunner {
  static async run(options: PromptOptions): Promise<void> {
    const {
      promptName,
      models: modelsArg = 'gemini-3-pro-preview,gemini-3-flash-preview',
      interactive = false,
      ...rest
    } = options;
    const argv = { ...options, ...rest };

    const fileName = promptName.endsWith('.md') ? promptName : `${promptName}.md`;

    // 1. Check User Override
    let promptFile = path.join(process.cwd(), '.agent/prompts', fileName);
    let usingOverride = false;

    try {
      await fs.access(promptFile);
      logger.debug(`[Agent] Using user override: ${promptFile}`);
      usingOverride = true;
    } catch {
      // Fallback to package prompts
      promptFile = path.join(PACKAGE_PROMPTS_DIR, fileName);

      try {
        await fs.access(promptFile);
      } catch {
        // One more fallback: .reskiller/prompts (initialized by Initializer)
        const initializedPromptsDir = path.join(process.cwd(), '.reskiller/prompts');
        promptFile = path.join(initializedPromptsDir, fileName);

        try {
          await fs.access(promptFile);
        } catch {
          throw new Error(
            `Prompt file not found in:\n- ${path.join(process.cwd(), '.agent/prompts', fileName)}\n- ${path.join(PACKAGE_PROMPTS_DIR, fileName)}\n- ${promptFile}`,
          );
        }
      }
    }

    const loaderPath = usingOverride ? path.dirname(promptFile) : path.dirname(promptFile);

    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(loaderPath), {
      autoescape: false,
      trimBlocks: true,
      lstripBlocks: true,
    });

    env.addGlobal('context', (targetPath: string) => {
      try {
        if (!existsSync(targetPath)) {
          logger.debug(`[Context] Path not found: ${targetPath}`);
          return `[Path not found: ${targetPath}]`;
        }

        const stats = statSync(targetPath);
        if (stats.isFile()) {
          logger.debug(`[Context] Reading file directly at: ${targetPath}`);
          const content = readFileSync(targetPath, 'utf-8');
          return `<CODEBASE_CONTEXT path="${targetPath}">\n${content}\n</CODEBASE_CONTEXT>`;
        }

        logger.debug(`[Context] Analyzing codebase at: ${targetPath}`);
        const output = execSync(
          `npx -y repomix --stdout --quiet --style xml --include "${targetPath}/**/*" --ignore "**/node_modules,**/dist"`,
          { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] },
        );
        return `<CODEBASE_CONTEXT path="${targetPath}">\n${output}\n</CODEBASE_CONTEXT>`;
      } catch {
        logger.error(`[Context] Error generating context for ${targetPath}`);
        return `[Error generating context for ${targetPath}]`;
      }
    });

    env.addGlobal('read', (relativePath: string | string[]) => {
      try {
        if (Array.isArray(relativePath)) {
          return relativePath
            .map((p) => {
              const resolvedPath = path.resolve(process.cwd(), p);
              if (!existsSync(resolvedPath)) {
                logger.debug(`[Read] File not found: ${resolvedPath}`);
                return `[File not found: ${resolvedPath}]`;
              }
              return readFileSync(resolvedPath, 'utf-8');
            })
            .join('\n\n');
        } else if (typeof relativePath === 'string' && relativePath.includes(',')) {
          // Fallback in case Nunjucks interpolated it as a comma-separated string earlier
          return relativePath
            .split(',')
            .map((p) => {
              const resolvedPath = path.resolve(process.cwd(), p.trim());
              if (!existsSync(resolvedPath)) {
                logger.debug(`[Read] File not found: ${resolvedPath}`);
                return `[File not found: ${resolvedPath}]`;
              }
              return readFileSync(resolvedPath, 'utf-8');
            })
            .join('\n\n');
        }

        const resolvedPath = path.resolve(process.cwd(), relativePath);
        if (!existsSync(resolvedPath)) {
          logger.debug(`[Read] File not found: ${resolvedPath}`);
          return `[File not found: ${resolvedPath}]`;
        }
        return readFileSync(resolvedPath, 'utf-8');
      } catch {
        logger.error(`[Read] Error reading file: ${relativePath}`);
        return `[Error reading file ${relativePath}]`;
      }
    });

    let templateContent: string;
    try {
      templateContent = await fs.readFile(promptFile, 'utf-8');
    } catch (error) {
      throw new Error(
        `Error reading prompt file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    logger.debug('[Render] Rendering template with variables:', argv);

    let renderedPrompt: string;
    try {
      renderedPrompt = env.renderString(templateContent, {
        ...argv,
      });
    } catch (e) {
      throw new Error(`Template render error: ${e}`);
    }

    const tempFile = path.join(os.tmpdir(), `.temp_prompt_${Date.now()}.md`);
    await fs.writeFile(tempFile, renderedPrompt, 'utf-8');
    logger.debug(`[Buffer] Wrote active prompt to ${tempFile}`);

    const models = modelsArg
      .split(',')
      .map((m: string) => m.trim())
      .filter(Boolean);

    logger.debug(`[Agent] Model rotation strategy: [${models.join(', ')}]`);

    let currentPrompt = renderedPrompt;
    let finalCode = 0;

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
          logger.debug(`[Agent] Switching to next model...`);
          continue;
        } else {
          finalCode = result.code;
          break;
        }
      }

      if (!success) {
        if (finalCode === 0) finalCode = 1;
        logger.error(`[Agent] All attempts failed.`);
        break;
      }

      if (!interactive) {
        break;
      }

      currentPrompt += `\n${lastOutput}`;

      const answer = await this.askUser();

      if (['exit', 'quit'].includes(answer.trim().toLowerCase())) {
        break;
      }
      currentPrompt += `\nUser: ${answer}\n`;
    }

    try {
      if (existsSync(tempFile)) {
        await fs.unlink(tempFile);
        logger.debug(`[Cleanup] Removed active prompt file`);
      }
    } catch {
      // ignore
    }

    if (finalCode !== 0) {
      throw new Error(`Prompt execution failed with code ${finalCode}`);
    }
  }

  private static runGemini(model: string, input: string): Promise<GeminiResult> {
    return new Promise((resolve) => {
      logger.debug(`[Agent] Attempting with model: ${model}...`);
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
          logger.warn(`[Agent] Model ${model} exhausted (429). Duration: ${duration}ms`);
          resolve({ code: exitCode, shouldRetry: true, output: stdoutData });
        } else {
          resolve({ code: exitCode, shouldRetry: false, output: stdoutData });
        }
      });

      child.on('error', (err) => {
        logger.error(
          `[Agent] Failed to spawn Gemini (${model}): ${err instanceof Error ? err.message : String(err)}`,
        );
        resolve({ code: 1, shouldRetry: false, output: '' });
      });
    });
  }

  private static askUser(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise<string>((resolve) => {
      logger.info('\n(Type "exit" or "quit" to end the session)');
      rl.question('> ', (ans) => {
        rl.close();
        resolve(ans);
      });
    });
  }
}
