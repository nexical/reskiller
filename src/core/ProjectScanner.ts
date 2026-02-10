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

  async scan(): Promise<Project[]> {
    console.info('🔭 ProjectScanner: Scanning for projects...');
    const { root, markers, ignore, depth } = this.config.discovery;

    // Convert ignore patterns to glob format if needed, or assume they are glob-ish
    // fast-glob ignore patterns: ['**/node_modules/**', '**/dist/**']
    const strictIgnore = ignore.map((pattern) => `**/${pattern}/**`);

    const projects: Project[] = [];
    const seenPaths = new Set<string>();

    for (const marker of markers) {
      // Look for folders named .skills directory recursively
      // Pattern: **/.skills
      const pattern = `**/${marker}`;

      const skillDirs = await fg(pattern, {
        cwd: path.resolve(this.cwd, root),
        ignore: strictIgnore,
        deep: depth,
        onlyDirectories: true,
        absolute: true,
      });

      for (const skillDirPath of skillDirs) {
        const projectPath = path.dirname(skillDirPath);

        if (seenPaths.has(projectPath)) continue;
        seenPaths.add(projectPath);

        const project = this.resolveProject(projectPath, skillDirPath);
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
          `⚠️  Failed to parse package.json at ${pkgJsonPath}, using directory name: ${name}`,
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
