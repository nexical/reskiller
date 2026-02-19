import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';
import { ReskillConfig, parseReskillerConfig, mergePartialConfigs } from '../config.js';
import { logger } from './Logger.js';

export interface Project {
  name: string;
  path: string;
  skillDir: string;
  overrides?: Partial<ReskillConfig>;
}

export class ProjectScanner {
  private config: ReskillConfig;
  private cwd: string;

  constructor(config: ReskillConfig, cwd: string = process.cwd()) {
    this.config = config;
    this.cwd = cwd;
  }

  async scan(scope?: string): Promise<Project[]> {
    const { root, ignore, depth } = this.config.discovery;
    const markers = ['.git', '.skills'];

    // We must ensure the markers themselves are NOT ignored during discovery
    const filteredIgnore = ignore.filter((p: string) => !markers.includes(p));
    const strictIgnore = filteredIgnore.map((pattern: string) => `**/${pattern}/**`);

    const projects: Project[] = [];
    const seenPaths = new Set<string>();

    for (const marker of markers) {
      // Look for folders/files named .git or .skills recursively (including root)
      const patterns = [marker, `**/${marker}`];

      const skillDirs = await fg(patterns, {
        cwd: path.resolve(this.cwd, root),
        ignore: strictIgnore,
        deep: depth,
        onlyFiles: false,
        onlyDirectories: false,
        absolute: true,
        dot: true,
      });

      for (const skillDirPath of skillDirs) {
        let projectPath = path.dirname(skillDirPath);
        let finalSkillDir = skillDirPath;

        // If marker was .git, the skill directory is actually .skills in that same project
        if (skillDirPath.endsWith('.git')) {
          finalSkillDir = path.join(projectPath, '.skills');
        }

        // Scoping logic:
        // 1. If project path is within scope, include as is.
        // 2. If scope is within project path, include project but update its path to scope.
        // 3. Otherwise, exclude.

        if (scope) {
          const relativeToScope = path.relative(scope, projectPath);
          const relativeToProject = path.relative(projectPath, scope);

          const projectInsideScope =
            !relativeToScope.startsWith('..') && !path.isAbsolute(relativeToScope);
          const scopeInsideProject =
            !relativeToProject.startsWith('..') && !path.isAbsolute(relativeToProject);

          if (projectInsideScope) {
            // Include as is
          } else if (scopeInsideProject) {
            // Update project path to scope
            projectPath = scope;
          } else {
            // Exclude
            continue;
          }
        }

        if (seenPaths.has(projectPath)) continue;
        seenPaths.add(projectPath);

        const project = this.resolveProject(projectPath, finalSkillDir);
        projects.push(project);
      }
    }

    // Sort by name for consistency
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  private resolveProject(projectPath: string, skillDirPath: string): Project {
    let name = path.basename(projectPath);
    const pkgJsonPath = path.join(projectPath, 'package.json');

    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (pkg.name) {
          name = pkg.name;
        }
      } catch {
        logger.warn(
          `Failed to parse package.json at ${pkgJsonPath}, using directory name: ${name}`,
        );
      }
    }

    const overrides = this.resolveOverrides(projectPath);

    return {
      name,
      path: projectPath,
      skillDir: skillDirPath,
      overrides,
    };
  }

  private resolveOverrides(projectPath: string): Partial<ReskillConfig> | undefined {
    const { root } = this.config.discovery;
    const discoveryRoot = path.resolve(this.cwd, root);

    let currentDir = projectPath;
    const overrideFiles: string[] = [];

    // Walk up to discovery root to collect overrides
    while (currentDir.startsWith(discoveryRoot)) {
      const yamlPath = path.join(currentDir, 'reskiller.yaml');
      if (fs.existsSync(yamlPath)) {
        overrideFiles.unshift(yamlPath); // Root-most first
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }

    if (overrideFiles.length === 0) return undefined;

    let combinedOverrides: Partial<ReskillConfig> = {};
    for (const file of overrideFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const parsed = parseReskillerConfig(content);
        combinedOverrides = mergePartialConfigs(combinedOverrides, parsed);
      } catch (e) {
        logger.warn(`Failed to parse override file ${file}: ${e}`);
      }
    }

    return Object.keys(combinedOverrides).length > 0 ? combinedOverrides : undefined;
  }
}
