#!/usr/bin/env -S npx tsx
import { PromptRunner } from './PromptRunner.js';

async function main() {
  const runner = new PromptRunner();
  const code = await runner.run(process.argv.slice(2));
  process.exit(code);
}

// Only run if executed directly (or we can just run it since it is a CLI script)
// But to be safe and if we import it, we don't want to run it.
// However, previously it was running main().catch(...).
// So let's keep it simple.

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
