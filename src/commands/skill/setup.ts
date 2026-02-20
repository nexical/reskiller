import { BaseCommand } from '@nexical/cli-core';
import { ReskillConfig, getReskillConfig } from '../../config.js';
import { ensureSymlinks } from '../../core/Symlinker.js';
import { ProjectScanner } from '../../core/ProjectScanner.js';
import { Bundler } from '../../core/Bundler.js';
import { updateContextFiles } from '../../core/Pipeline.js';
import { logger } from '../../core/Logger.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

export default class SetupCommand extends BaseCommand {
  static description = 'Initializes context paths and integrates discovered skills globally';
  static args = {
    args: [
      {
        name: 'directory',
        description: 'Optional directory to scope the initialization to',
        required: false,
      },
    ],
  };

  async run(options: { directory?: string } = {}) {
    logger.setCommand(this);
    logger.setDebug(this.globalOptions.debug);

    let config: ReskillConfig;
    try {
      config = getReskillConfig(this.config, this.projectRoot || process.cwd());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(message);
      return;
    }

    // Resolve scope directory if provided
    const root = this.projectRoot || process.cwd();
    let scope: string | undefined;
    if (options.directory) {
      scope = path.resolve(root, options.directory);
      logger.info(`🎯 Scoping setup to: ${scope}`);
      if (!fs.existsSync(scope)) {
        logger.error(`Scoped directory does not exist: ${scope}`);
        return;
      }
    }

    // Auto-initialize environment (prompts, initial symlinks base)
    const { Initializer } = await import('../../core/Initializer.js');
    Initializer.initialize(config, root);

    // 0. Clean integration directory
    const integrationDir = path.join(root, '.reskill', 'skills');
    if (fs.existsSync(integrationDir)) {
      logger.info('🧹 Cleaning existing skill integration directory...');
      fs.rmSync(integrationDir, { recursive: true, force: true });
    }

    // 1. Discovery
    logger.info('🔭 Discovering projects and bundling skills...');
    const projectScanner = new ProjectScanner(config, root);
    const projects = await projectScanner.scan(scope);
    logger.info(`✅ Found ${projects.length} projects.`);
    for (const p of projects) {
      logger.info(`   - ${p.name} (${path.relative(process.cwd(), p.path)})`);
    }

    // 2. Bundling
    const bundler = new Bundler(config);
    await bundler.bundle(projects);
    const bundleDir = bundler.getBundleDir();

    // 3. Symlinking
    ensureSymlinks(config, root, bundleDir);

    // 4. Update Contexts
    logger.info('📚 Updating Context Files...');
    await updateContextFiles(config, root);
    logger.success('✅ Skills successfully integrated. Context files updated.');
  }
}
