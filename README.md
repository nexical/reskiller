# @nexical/reskill

**The Adaptive Skill Learning System for the Nexus Ecosystem.**

`@nexical/reskill` is an advanced AI agent toolchain designed to keep the AI's "Brain" (the `.agent/skills` directory) in sync with the "Body" (the actual codebase). Instead of relying on static, manually written documentation, this system proactively scans the codebase to **discover**, **learn**, and **evolve** its own capabilities.

---

## 🧠 How It Works

The system operates on a biological metaphor of "Learning from Experience." It does not assume the documentation is true; it assumes the **Code is Truth**.

### 1. The Learning Pipeline

The process is divided into three distinct phases, handled by specialized AI Agents:

#### Phase 1: Discovery (The Explorer)

**Agent**: `Explorer`
**Input**:

- **Platform Core**: `core/src` (The Kernel)
- **Generator**: `packages/generator/src` (The Tooling)
- **Modules**: `apps/backend/modules/` and `apps/frontend/modules/` (The User Space)

**Goal**: Build a "Knowledge Graph" of the current reality.

The **Explorer** acts as a data scientist. It:

1.  **Scans the Platform**: Deeply analyzes the Core and Generator to understand the fundamental patterns of the OS (The "Kernel Truth").
2.  **Scans Modules**: Indexes all installed modules across Frontend and Backend.
3.  **Identifies Exemplars**: Finds modules that best implement the Core's philosophy (e.g., "The best API module is `orchestrator-api`").
4.  **Detects Drift**: Flags modules that are diverging from the Core patterns.

#### Phase 2: Strategy (The Architect)

**Agent**: `Architect`
**Input**: `knowledge-graph.json` (from Explorer) + `.agent/skills` (Current Knowledge)
**Goal**: Design a strategic "Reskill Plan".

The **Architect** acts as a CTO/Staff Engineer. It compares "What we do" (Code) vs. "What we teach" (Skills).

- If a new pattern emerges in code (e.g., "We started using TRPC"), it proposes **creating** a new skill.
- If an existing skill references legacy patterns, it proposes **updating** it using the new Exemplar.
- If two skills overlap, it proposes **merging** them.

#### Phase 3: Execution (The Teachers)

**Agents**: `Auditor`, `Critic`, `Instructor`
**Input**: The Exemplar Module + The Skill Document
**Goal**: Rewrite the documentation.

1.  **Auditor**: Extracts the "Codebase Canon" (the raw facts) from the Exemplar module.
2.  **Critic**: Compares the Canon vs. the current Skill Document to generate a "Drift Report".
3.  **Instructor**: Rewrites the Skill Document to match the Codebase Canon.

---

## 🛠 Usage

### CLI Commands

Run the tool via `npx` (or `tsx` during development).

#### 1. Full Evolution Cycle

Run the complete pipeline to Discover, Strategize, and (eventually) Execute updates across the entire system.

```bash
# From packages/reskill
npx tsx src/index.ts evolve
```

#### 2. Targeted Refinement

Manually forcing the system to relearn a specific skill using a specific module as the "Truth".

```bash
# Syntax: refine <skill-name> <path-to-exemplar-module>
npx tsx src/index.ts refine construct-api apps/backend/modules/user-api
```

---

## 📂 Project Structure

```text
packages/reskill/
├── prompts/        # AI Agent System Prompts
├── src/
│   ├── index.ts        # CLI Entrypoint
│   ├── cli/            # CLI Command Handlers (prompt.ts)
│   ├── agents/         # AI Agent Wrappers (AgentRunner)
│   ├── core/           # Business Logic
│   │   ├── Explorer.ts # Scans Platform & Modules
│   │   └── Architect.ts# Plans Skill Updates
│   └── types.ts        # Shared Definitions
├── package.json
└── tsconfig.json
```

## 🤖 Configuration

The system relies on the global **Constitution** files in the `core/` directory:

- `core/ARCHITECTURE.md`: The high-level laws.
- `core/MODULES.md`: The categorization rules.

The agents use these files to ground their analysis, ensuring they don't hallucinate patterns that violate the fundamental architecture.
