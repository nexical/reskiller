# Reskill: The Agentic Learning System

Reskill is a framework for creating, evolving, and refining "Skills" (system prompts, context rules, and tools) for AI Agents within the Nexical ecosystem.

It treats skills as software artifacts that can be:

1.  **Discovered**: Scanned from your codebase (`.skills` directories).
2.  **Evolved**: Improved based on an "Exemplar" (truth) implementation using an Architect AI.
3.  **Refined**: Polished through a rigorous audit/critic/instructor pipeline.
4.  **Distributed**: Symlinked to consumption points (VS Code, Cursor, GitHub Copilot).

## Configuration

Reskill is configured through the `nexical.yaml` file in your project root, under the `reskill` key.

### Schema

```yaml
reskill:
  # Constitution governing the AI's behavior and architectural rules
  constitution:
    architecture: 'ARCHITECTURE.md'
    patterns: 'MODULAR_PATTERNS.md' # Optional (string or string array)

  # Discovery settings for finding projects and distributed skills
  discovery:
    root: '.' # Root directory to scan from
    ignore: # Directories to ignore
      - 'node_modules'
      - 'dist'
      - '.git'
    depth: 5 # Max recursion depth

  # Output settings for context injection and symlinking
  outputs:
    # Files to concatenate into a global context (e.g., GEMINI.md)
    contextFiles:
      - 'AGENTS.md'
      - 'GEMINI.md'
      - 'CLAUDE.md'

    # Symlinks to create pointing to the generated skills (bundle)
    symlinks:
      - .agent/skills
      - .gemini/skills
      - .claude/skills
```

## Usage

Reskill automatically initializes its environment on the first run of any command. You do not need to run a manual setup.

- **Global Prompts**: Stored in `.reskiller/prompts`. You can customize these files.
- **Skills**: Discovered from `.skills` directories across your projects and bundled in `.reskill/skills`.

### Commands

#### `nexical skill evolve`

Scans your projects for `.skills` directories, bundles them, and runs the Evolution Pipeline to create or update skills based on your code and constitution.

#### `nexical skill refine [skill-name] [module-path]`

Runs a targeted refinement loop on a specific skill, using the module path as the ground truth.

#### `nexical skill watch` (Pro)

Watches your project for file changes and incrementally refines relevant skills.

## Architecture

Reskill follows a "Core & Shell" architecture:

- **Core**: The immutable logic for pipelines, agents, and configuration.
- **Shell**: The `nexical` CLI that hosts the commands.
- **Registry**: The collection of skills themselves.

## License

Some advanced features (like `watch`) require a Pro license key, which can be configured in `nexical.yaml` (`licenseKey`) or via the `RESKILL_LICENSE_KEY` environment variable.
