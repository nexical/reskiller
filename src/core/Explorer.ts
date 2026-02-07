import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRunner } from '../agents/AgentRunner.js';

export class Explorer {
  private modulesDir: string;
  private coreDir: string;
  private tmpDir: string;

  constructor(modulesDir: string, coreDir: string, tmpDir: string) {
    this.modulesDir = modulesDir;
    this.coreDir = coreDir;
    this.tmpDir = tmpDir;
  }

  async discover(): Promise<string> {
    console.info('🔍 Explorer: Scanning modules and core...');

    const coreModule = this.scanCore();
    const modules = this.scanModules();

    const allModules = [coreModule, ...modules];

    const modulesJson = JSON.stringify(allModules, null, 2);
    const modulesFile = path.join(this.tmpDir, 'modules-index.json');
    fs.writeFileSync(modulesFile, modulesJson);

    const outputFile = path.join(this.tmpDir, 'knowledge-graph.json');

    AgentRunner.run('Explorer', 'prompts/agents/explorer.md', {
      modules_list: modulesFile,
      arch_file: 'ARCHITECTURE.md',
      output_file: outputFile,
    });

    return outputFile;
  }

  private scanCore() {
    if (!fs.existsSync(this.coreDir)) {
      throw new Error(`Core directory not found: ${this.coreDir}`);
    }
    return {
      name: 'core',
      path: this.coreDir,
      type: 'kernel',
      files: this.listFiles(this.coreDir),
    };
  }

  private scanModules() {
    if (!fs.existsSync(this.modulesDir)) {
      return [];
    }
    return fs
      .readdirSync(this.modulesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const fullPath = path.join(this.modulesDir, d.name);
        return {
          name: d.name,
          path: fullPath,
          files: this.listFiles(fullPath),
        };
      });
  }

  private listFiles(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return [];

    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file === 'node_modules' || file === '.git') continue;
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(this.listFiles(filePath));
      } else {
        results.push(filePath);
      }
    }
    return results;
  }
}
