import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRunner } from '../agents/AgentRunner.js';
import { Project } from './ProjectScanner.js';
import { logger } from './Logger.js';

interface ScannedProject {
  name: string;
  path: string;
  files: string[];
}

export class Explorer {
  private constitution: { architecture: string; patterns?: string };
  private projects: Project[];
  private tmpDir: string;

  constructor(
    projects: Project[],
    constitution: { architecture: string; patterns?: string },
    tmpDir: string,
  ) {
    this.projects = projects;
    this.constitution = constitution;
    this.tmpDir = tmpDir;
  }

  async discover(): Promise<string> {
    logger.info('🔍 Explorer: Analyzing projects...');

    const scannedProjects = this.scanProjects();

    const modulesJson = JSON.stringify(scannedProjects, null, 2);
    const modulesFile = path.join(this.tmpDir, 'modules-index.json');
    fs.writeFileSync(modulesFile, modulesJson);

    const outputFile = path.join(this.tmpDir, 'knowledge-graph.json');

    AgentRunner.run('Explorer', 'agents/explorer.md', {
      modules_list: modulesFile,
      constitution: this.constitution,
      output_file: outputFile,
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
