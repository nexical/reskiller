# @nexical/reskill

Reskill is an Adaptive Learning System for the Nexus Ecosystem, designed for creating, evolving, and refining "Skills" (system prompts, context rules, and templates) for AI Agents.

It treats architecture and best practices as **living software artifacts** that can be:

1.  **Discovered**: Scanned from your codebase (`.skills` directories).
2.  **Learned**: Evaluated and updated based on architectural "Patterns" (Truth) in your codebase via an Architect AI.
3.  **Distributed**: Bundled and symlinked to consumption points (VS Code, Cursor, GitHub Copilot).

---

## 🏗️ Architecture Overview

Reskill follows a **Core, Shell & Registry** architecture.

- **Core (`src/core/`)**: The immutable logic driving the cyclical **Learning Loop** (`Explore -> Strategize -> Execute`).
- **Shell (`src/commands/`)**: The CLI interface via `@nexical/cli-core` exposing `nexical skill learn` and `nexical skill watch`.
- **Registry (`.reskill/skills/`)**: The output destination where generated skills are bundled and exposed.

It relies on the `@nexical/ai` package for an abstract LLM interaction capability, supporting seamless model rotation (e.g. `gemini-3-pro-preview` falling back to `gemini-3-flash-preview`) and robust context generation via `repomix`.

> **Note:** For a comprehensive overview of the components, pipelines, and data flow, please see the [Architecture & Specification Guide](./ARCHITECTURE.md).

---

## ⚙️ Configuration

Reskill is configured through the `nexical.yaml` file in your project root, under the `reskill` key.

### Schema Example

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
    depth: 5 # Max recursion depth

  # Output settings for context injection and symlinking
  outputs:
    # Files to concatenate into a global context (e.g., GEMINI.md)
    contextFiles:
      - 'GEMINI.md'
      - '.cursorrules'

    # Symlinks to create pointing to the generated skills (bundle)
    symlinks:
      - .agent/skills
      - .gemini/skills
```

---

## 🚀 Usage

Reskill automatically initializes its environment (scaffolds directories and copies prompts) on the first execution of any command.

### `nexical skill learn`

Runs the **full learning loop** (Explorer -> Architect -> Pipeline).

- Scans your projects for `.skills` directories, bundles them, and runs the multi-stage AI Pipeline to audit and update skills based on your code's real-world patterns.
- Best for CI/CD pipelines or nightly builds.

```bash
nexical skill learn
```

### `nexical skill watch` (Pro)

Runs as a daemon, watching your project workspace for file changes.

- Incrementally triggers drift detection when core files change and seamlessly rewrites relevant skills on-the-fly.

```bash
nexical skill watch
```

## 🧩 Extension

Reskill is fully extensible through its hooks system and **Prompt Overrides**:
You can map specific AI personas (Auditor, Critic, Instructor) to customized system prompts located in `.agent/prompts/agents/`.
