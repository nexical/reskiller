---
name: reskill-implement-agent-runner
description: 'Implements the standard `AgentRunner` pattern for Reskill agents, ensuring consistent error handling, logging, and execution flow. This pattern enforces a stateless, static service architecture with s...'
---

# Skill: Implement Agent Runner

## Description

Implements the standard `AgentRunner` pattern for Reskill agents, ensuring consistent error handling, logging, and execution flow. This pattern enforces a stateless, static service architecture with strict ESM compliance and centralized logging.

## Critical Instructions

### 1. ESM Imports

- **ALWAYS** use explicit `.js` extensions for local relative imports.
  - **Good**: `import { PromptRunner } from './PromptRunner.js';`
  - **Bad**: `import { PromptRunner } from './PromptRunner';`

### 2. Static Service Pattern

- **ALWAYS** implement runners as classes with `static` methods.
- **NEVER** instantiate the runner class.
- **Example**: `export class MyAgent { static async run(...) { ... } }`

### 3. Structured Error Handling

- **ALWAYS** wrap the execution logic in a `try/catch` block.
- **ALWAYS** catch `unknown` errors.
- **ALWAYS** log the error using the centralized logger before re-throwing.
- **ALWAYS** normalize errors to `Error` objects before re-throwing.

### 4. Centralized Logging

- **NEVER** use `console.log`, `console.error`, etc.
- **ALWAYS** use the centralized logger: `import { logger } from '../core/Logger.js';`.

### 5. Named Exports

- **ALWAYS** use named exports for the class.
  - **Good**: `export class AgentRunner { ... }`
  - **Bad**: `export default class AgentRunner { ... }`

## Available Resources

- **Template**: [AgentRunner.ts](./templates/AgentRunner.ts)
