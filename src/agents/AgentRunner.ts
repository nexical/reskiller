import { execSync } from 'node:child_process';

const PROMPT_CMD = 'npx prompt';
const MODELS = 'gemini-3-flash-preview,gemini-3-pro-preview';

export class AgentRunner {
  static run(agentName: string, promptPath: string, args: Record<string, string>) {
    const allArgs = { ...args, models: MODELS };
    const flags = Object.entries(allArgs)
      .map(([key, value]) => `--${key} "${value}"`)
      .join(' ');

    const cmd = `${PROMPT_CMD} ${promptPath} ${flags}`;

    console.info(`\n🤖 Agent ${agentName} working...`);
    try {
      execSync(cmd, { stdio: 'inherit', cwd: process.cwd() }); // Run from root
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Agent ${agentName} failed execution: ${message}`);
    }
  }
}
