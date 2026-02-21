# Skill: Create CLI Command (Reskill)

This skill guides the creation of new CLI commands within the `reskill` package, ensuring adherence to the `@nexical/cli-core` architecture and local patterns.

## Context

The `reskill` CLI is built on top of `@nexical/cli-core`. Commands are class-based, extending `BaseCommand`, and are automatically discovered from the `src/commands` directory.

## Standards & Patterns

1.  **Inheritance**: All commands MUST extend `BaseCommand` from `@nexical/cli-core`.
2.  **Location**: Place command files in `packages/reskill/src/commands/`. The file path determines the command name (e.g., `src/commands/foo/bar.ts` -> `reskill foo bar`).
3.  **Logger**: You MUST initialize the global `logger` singleton with the current command context at the start of the `run()` method.
    - Import: `import { logger } from '../../core/Logger.js';` (Adjust relative path as needed).
    - Init: `logger.setCommand(this);`
4.  **Imports**:
    - Use `node:` prefix for Node.js built-in modules (e.g., `node:path`).
    - Use explicit file extensions (e.g., `.js`) for local imports if required by the package configuration.
5.  **Logic**: Keep commands thin. Delegate complex business logic to `core/` classes (e.g., `Explorer`, `Scanner`).

## Implementation Template

Use the following template for new commands.

````typescript
import { BaseCommand } from '@nexical/cli-core';
import { logger } from '../../core/Logger.js';

export default class MyCommand extends BaseCommand {
  static description = 'Description of the command';

  static args = {
    args: [
      {
        name: 'myArg',
        description: 'Argument description',
        required: true,
      },
    ],
    options: [
      {
        name: '--debug',
        description: 'Enable debug mode',
        default: false,
      },
    ],
  };

  async run(options: any) {
    // 1. Initialize Logger
    logger.setCommand(this);

    // 2. Destructure inputs
    const { myArg, debug } = options;

    if (debug) {
        logger.setDebug(true);
    }

    // 3. Delegate to Core Logic
    this.info(`Executing command for ${myArg}`);
  }
}

## Advanced Patterns

### Dynamic Command Chaining

To invoke other CLI commands programmatically (e.g., to run a setup step) without introducing circular dependencies, use dynamic imports.

```typescript
// Inside your run() method
const { default: SetupCommand } = await import('./setup.js');
const cmd = new SetupCommand([], this.config);
// Pass context if needed
// cmd.projectRoot = this.projectRoot;
await cmd.run({ ...options });
````

```

```
