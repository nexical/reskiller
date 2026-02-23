import { PromptRunner, AiClientConfig } from '@nexical/ai';
import { logger } from '../core/Logger.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_PROMPTS_DIR = path.join(__dirname, '../../prompts');
const MODELS = ['gemini-3-pro-preview', 'gemini-3-flash-preview'];

export class AgentRunner {
  static async run(agentName: string, promptPath: string, args: Record<string, unknown>) {
    logger.info(`🤖 Agent ${agentName} working...`);

    const aiConfig = args.aiConfig as AiClientConfig;
    const cwdStr = (args.cwd as string) || process.cwd();

    try {
      const exitCode = await PromptRunner.run({
        promptName: promptPath,
        promptDirs: [
          path.join(cwdStr, '.agent/prompts'),
          path.join(cwdStr, '.reskiller/prompts'),
          PACKAGE_PROMPTS_DIR,
        ],
        args,
        aiConfig,
        models: MODELS,
        interactive: args.interactive as boolean | undefined,
      });

      if (exitCode !== 0) {
        throw new Error(`Execution failed with code ${exitCode}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const fullMessage = `Agent ${agentName} failed execution: ${message}`;
      logger.error(fullMessage);
      throw new Error(fullMessage);
    }
  }
}
