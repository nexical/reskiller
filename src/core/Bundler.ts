import * as fs from 'node:fs';
import * as path from 'node:path';
import { Project } from './ProjectScanner.js';
import { ReskillConfig } from '../config.js';
import { logger } from './Logger.js';

export class Bundler {
  private config: ReskillConfig;
  private cwd: string;
  private bundleDir: string;

  constructor(config: ReskillConfig, cwd: string = process.cwd()) {
    this.config = config;
    this.cwd = cwd;
    this.bundleDir = path.join(cwd, '.reskill', 'skills');
  }

  async bundle(projects: Project[]): Promise<void> {
    logger.info('📦 Bundler: Aggregating skills...');

    // Clean bundle directory
    if (fs.existsSync(this.bundleDir)) {
      fs.rmSync(this.bundleDir, { recursive: true, force: true });
    }
    fs.mkdirSync(this.bundleDir, { recursive: true });

    // Bundle Project Skills
    for (const project of projects) {
      await this.linkProjectSkills(project);
    }

    // Bundle Global Skills (if they exist in root skillsDir and it's not already covered)
    // NOTE: If the root itself is scanned as a project, its skills will be bundled under its name (e.g. "reskill" or "nexical-core").
    // However, users might expect "global" skills to be at the top level or a specific _global folder.
    // Let's explicitly handle the configured `skillsDir` (Legacy global/root skills)
    const globalSkillsPath = path.resolve(this.cwd, this.config.skillsDir);
    if (fs.existsSync(globalSkillsPath)) {
      // If the global skills path is NOT one of the project skill dirs, link it.
      const isProjectSkill = projects.some((p) => p.skillDir === globalSkillsPath);
      if (!isProjectSkill) {
        await this.createSymlink(globalSkillsPath, path.join(this.bundleDir, '_global'));
      }
    }
  }

  private async linkProjectSkills(project: Project) {
    const targetDir = path.join(this.bundleDir, project.name);

    // Safety check: ensure we don't overwrite if multiple projects have same name (unlikely with unique keys, but possible with simple names)
    if (fs.existsSync(targetDir)) {
      logger.warn(`Collision detected for project name: ${project.name}. Creating unique alias.`);
      // Simple alias logic: append hash or path seq? Let's just warn for now.
    }

    await this.createSymlink(project.skillDir, targetDir);
  }

  private async createSymlink(target: string, pathLike: string) {
    try {
      // Ensure parent exists
      fs.mkdirSync(path.dirname(pathLike), { recursive: true });

      // Create symlink
      // We use absolute paths for simplicity in the bundle
      fs.symlinkSync(target, pathLike, 'dir');
      logger.debug(`🔗 Linked ${target} -> ${pathLike}`);
    } catch (e) {
      logger.error(`Failed to link ${target} to ${pathLike}: ${e}`);
    }
  }

  public getBundleDir(): string {
    return this.bundleDir;
  }
}
