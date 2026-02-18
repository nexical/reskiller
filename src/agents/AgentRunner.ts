import { PromptRunner } from './PromptRunner.js';
import { logger } from '../core/Logger.js';

const MODELS = 'gemini-3-pro-preview,gemini-3-flash-preview';

export class AgentRunner {
  static async run(agentName: string, promptPath: string, args: Record<string, unknown>) {
    logger.info(`🤖 Agent ${agentName} working...`);

    try {
      await PromptRunner.run({
        promptName: promptPath,
        models: MODELS,
        ...args,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const fullMessage = `Agent ${agentName} failed execution: ${message}`;
      logger.error(fullMessage);
      throw new Error(fullMessage);
    }
  }
}
