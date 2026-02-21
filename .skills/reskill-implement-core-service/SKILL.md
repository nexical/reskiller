# Skill: Implementing Core Services in Reskill

**Description**: Defines the standard patterns for implementing core services within the `@nexical/reskill` package.

## 1. Mandates

### 1.1 ESM Import Style

- **Rule**: All local imports MUST use the `.js` extension.
- **Rule**: Node.js built-ins MUST use the `node:` prefix.
- **Why**: Ensures compatibility with ESM (ECMAScript Modules) and modern Node.js runtimes.

```typescript
// GOOD
import { Logger } from './Logger.js';
import * as fs from 'node:fs';

// BAD
import { Logger } from './Logger';
import * as fs from 'fs';
```

### 1.2 Service Class Encapsulation

- **Rule**: Core logic MUST be encapsulated in classes with **PascalCase** names.
- **Rule**: Classes MUST use **Named Exports**.
- **Rule**: Configuration and dependencies MUST be injected via the **constructor**.
- **Why**: Promotes testability, separation of concerns, and clear dependency management.

```typescript
// GOOD
export class ProjectScanner {
  constructor(private config: ReskillConfig) {}
}

// BAD
export const scan = (config) => { ... }
```

### 1.3 Robust Path Handling

- **Rule**: All path manipulation MUST use `node:path`.
- **Rule**: String concatenation for paths is **FORBIDDEN**.
- **Why**: Ensures cross-platform compatibility (Windows vs POSIX).

```typescript
import * as path from 'node:path';

// GOOD
const fullPath = path.join(root, 'package.json');

// BAD
const fullPath = root + '/package.json';
```

### 1.4 Hierarchical Configuration

- **Rule**: Configuration resolution MUST respect directory hierarchy if overrides are needed.
- **Rule**: Use a recursive or iterative approach to traverse up the directory tree.
- **Why**: Allows for project-specific or directory-specific configuration overrides (e.g., finding `.reskillrc` in parent directories).

```typescript
// Example: Traversing up to find a config file
let currentDir = process.cwd();
while (currentDir !== path.parse(currentDir).root) {
  const configPath = path.join(currentDir, 'reskill.config.json');
  if (await fs.stat(configPath).catch(() => false)) {
    return loadConfig(configPath);
  }
  currentDir = path.dirname(currentDir);
}
```

## 2. Resources

- **Architecture**: [core/ARCHITECTURE.md](../../../../core/ARCHITECTURE.md)
- **Templates**: [templates/Service.ts](./templates/Service.ts)
