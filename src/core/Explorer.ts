import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRunner } from '../agents/AgentRunner.js';

interface PlatformDir {
  name: string;
  path: string;
}

export class Explorer {
  private moduleDirs: string[];
  private platformDirs: PlatformDir[];
  private tmpDir: string;

  constructor(moduleDirs: string[], platformDirs: PlatformDir[], tmpDir: string) {
    this.moduleDirs = moduleDirs;
    this.platformDirs = platformDirs;
    this.tmpDir = tmpDir;
  }

  async discover(): Promise<string> {
    console.info('🔍 Explorer: Scanning platform and modules...');

    const platformModules = this.scanPlatform();
    const modules = this.scanModules();

    const allModules = [...platformModules, ...modules];

    const modulesJson = JSON.stringify(allModules, null, 2);
    const modulesFile = path.join(this.tmpDir, 'modules-index.json');
    fs.writeFileSync(modulesFile, modulesJson);

    const outputFile = path.join(this.tmpDir, 'knowledge-graph.json');

    AgentRunner.run('Explorer', 'agents/explorer.md', {
      modules_list: modulesFile,
      arch_file: 'core/ARCHITECTURE.md',
      output_file: outputFile,
    });

    return outputFile;
  }

  private scanPlatform() {
    return this.platformDirs.map((dir) => {
      if (!fs.existsSync(dir.path)) {
        console.warn(`⚠️ Platform directory not found: ${dir.path}`);
        return {
          name: dir.name,
          path: dir.path,
          type: 'platform',
          files: [],
          error: 'Directory not found',
        };
      }
      return {
        name: dir.name,
        path: dir.path,
        type: 'platform',
        files: this.listFiles(dir.path),
      };
    });
  }

  private scanModules() {
    let allModules: any[] = [];

    for (const dir of this.moduleDirs) {
      if (!fs.existsSync(dir)) {
        console.warn(`⚠️ Module directory not found: ${dir}`);
        continue;
      }

      const modules = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const fullPath = path.join(dir, d.name);
          return {
            name: d.name,
            path: fullPath,
            type: 'module',
            files: this.listFiles(fullPath),
          };
        });

      allModules = allModules.concat(modules);
    }

    return allModules;
  }

  private listFiles(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return [];

    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
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
