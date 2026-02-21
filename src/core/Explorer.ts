import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRunner } from '../agents/AgentRunner.js';
import { Project } from './ProjectScanner.js';
import { ReskillConfig } from '../config.js';
import { logger } from './Logger.js';

interface ScannedProject {
  name: string;
  path: string;
  files: string[];
}

export class Explorer {
  private config: ReskillConfig;
  private projects: Project[];
  private tmpDir: string;
  private edit: boolean;

  constructor(projects: Project[], config: ReskillConfig, tmpDir: string, edit: boolean = false) {
    this.projects = projects;
    this.config = config;
    this.tmpDir = tmpDir;
    this.edit = edit;
  }

  async discover(recommendationsFile?: string): Promise<string> {
    logger.info('🔍 Explorer: Analyzing projects...');

    const scannedProjects = this.scanProjects();

    const modulesJson = JSON.stringify(scannedProjects, null, 2);
    const modulesFile = path.join(this.tmpDir, 'modules-index.json');
    fs.writeFileSync(modulesFile, modulesJson);

    const outputFile = path.join(this.tmpDir, 'knowledge-graph.json');

    await AgentRunner.run('Explorer', 'agents/explorer.md', {
      modules_list: modulesFile,
      constitution: this.config.constitution,
      aiConfig: this.config.ai,
      output_file: outputFile,
      edit_mode: this.edit,
      recommendations_file: recommendationsFile,
    });

    return outputFile;
  }

  private scanProjects(): ScannedProject[] {
    return this.projects.map((project) => {
      if (!fs.existsSync(project.path)) {
        logger.warn(`Project directory not found: ${project.path}`);
        return {
          name: project.name,
          path: project.path,
          files: [],
        };
      }
      return {
        name: project.name,
        path: project.path,
        files: this.listFiles(project.path),
      };
    });
  }

  private listFiles(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return [];

    const list = fs.readdirSync(dir);
    for (const file of list) {
      // Ignore standard junk
      if (file === 'node_modules' || file === '.git' || file === 'dist' || file === '.skills')
        continue;

      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        // Recursive
        results = results.concat(this.listFiles(filePath));
      } else {
        results.push(filePath);
      }
    }
    return results;
  }
}
