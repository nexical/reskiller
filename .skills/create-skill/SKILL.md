---
name: create-skill
description: Comprehensive guide for AI agents on how to create syntactically correct and standardized skills across all projects in the Nexical Ecosystem.
---

# Skill: Create AI Skill

This skill provides the authoritative workflow for AI agents to create new, standardized skills (`SKILL.md` files) across different projects within the Nexical Ecosystem.

## Critical Standards

When creating a new skill, you **MUST** ensure the following:

- **Project Context**: The skill must be placed in the appropriate project's `.skills/<kebab-name>/` directory (e.g., `packages/reskill/.skills/my-skill/`, `core/.skills/my-skill/`).
- **Core Neutrality**: Always reinforce the rule that the core platform must never know what modules are installed on the system. If relevant, remind agents to use module loaders or registries.

## Strict Quality Standards

Every skill you create **MUST** instruct the target agent to uphold strict quality standards:

- **Zero Tolerance for `any`**: The skill must explicitly state that using the `any` type is strictly prohibited.
- **ESLint Compliance**: The skill must explicitly state that all generated code must be strictly compliant with the project's ESLint rules.

## 1. Directory Structure and Naming

- **Location**: Skills must be placed in a directory named with the skill's kebab-case name inside the target project's `.skills/` directory.
  - Example: `packages/target-project/.skills/my-custom-skill/SKILL.md`.
- **Filename**: The instruction file MUST ALWAYS be named exactly `SKILL.md` with uppercase letters.

## 2. YAML Frontmatter Requirements

Every `SKILL.md` file **MUST** begin with exactly formatted YAML frontmatter containing the `name` and `description` of the skill. The frontmatter must be at the very top of the file.

```yaml
---
name: your-skill-name
description: A concise, one-sentence description of what this skill teaches AI agents to do.
---
```

## 3. Required Sections

When generating the markdown body of the skill, you **MUST** include the following standardized sections in order:

1. **Title**: An H1 header (e.g., `# Skill: My New Skill` or `# my-new-skill Skill`).
2. **Introduction**: A brief paragraph explaining the purpose of the skill.
3. **Critical Standards**: An H2 section (`## Critical Standards`) referencing core architectural rules relevant to the skill's domain.
4. **Strict Quality Standards**: An H2 section (`## Strict Quality Standards`) explicitly prohibiting the `any` type and mandating ESLint compliance.
5. **Implementation Guidance**: Numbered H2 sections (e.g., `## 1. Specific Feature`, `## 2. Best Practices`) detailing the specific rules, architectural patterns, and code templates the agent should follow.
6. **Anti-patterns (Optional but highly recommended)**: A section detailing what NOT to do (e.g., "FORBIDDEN" practices).

## 4. AI Writing Style

As an AI generating instructions for other AIs, you must optimize the content for machine comprehension:

- Use **imperative, unambiguous language** (e.g., "You MUST", "It is STRICTLY FORBIDDEN", "REQUIRED").
- Use markdown bolding for vital constraints.
- Provide clear, syntactically correct code examples (preferably TypeScript) where applicable.
- Avoid descriptive fluff; get straight to the rules and patterns.
