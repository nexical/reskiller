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
  }

  private async linkProjectSkills(project: Project) {
    if (!fs.existsSync(project.skillDir)) return;

    try {
      const skills = fs.readdirSync(project.skillDir, { withFileTypes: true });
      for (const dirent of skills) {
        if (dirent.isDirectory()) {
          const skillName = dirent.name;
          const targetName = `${project.name}-${skillName}`;
          const targetPath = path.join(this.bundleDir, targetName);
          const sourcePath = path.join(project.skillDir, skillName);

          await this.createSymlink(sourcePath, targetPath);
        }
      }
    } catch (e) {
      logger.warn(`Failed to read skills from ${project.skillDir}: ${e}`);
    }
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
