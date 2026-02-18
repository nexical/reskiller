import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';
import { ReskillConfig } from '../config.js';

export interface Project {
  name: string;
  path: string;
  skillDir: string;
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
        console.warn(
          `⚠️ Failed to parse package.json at ${pkgJsonPath}, using directory name: ${name}`,
        );
      }
    }

    return {
      name,
      path: projectPath,
      skillDir: skillDirPath,
    };
  }
}
