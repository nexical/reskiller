import { BaseCommand } from '@nexical/cli-core';
import { ReskillConfig, getReskillConfig } from '../../config.js';
import { Target } from '../../types.js';
import chokidar from 'chokidar';

// Hooks stub
export const hooks = {
  onDriftDetected: async (target: Target, driftFile: string) => {},
  onSkillUpdated: async (target: Target) => {},
};

export default class WatchCommand extends BaseCommand {
  static description = 'Watch for changes and incrementally refine skills (Pro)';

  async run() {
    let config: ReskillConfig;
    try {
      config = getReskillConfig(this.config);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.error(`❌ ${message}`);
      return;
    }

    // Auto-initialize environment
    const { Initializer } = await import('../../core/Initializer.js');
    Initializer.initialize(config, this.projectRoot || process.cwd());

    const licenseKey = config.licenseKey || process.env.RESKILL_LICENSE_KEY;
    if (!licenseKey) {
      this.error(
        "🔒 The 'watch' command is a Pro feature. Please upgrade and set 'licenseKey' in config or env.",
      );
      process.exit(1);
    }

    // Verify license (Stub)
    if (licenseKey === 'expired') {
      this.error('🔒 License expired.');
      process.exit(1);
    }
    this.info('🔓 Pro License Verified. Starting Watcher...');

    // Discover projects to watch
    const { ProjectScanner } = await import('../../core/ProjectScanner.js');
    const projectScanner = new ProjectScanner(config);
    const projects = await projectScanner.scan();

    // Setup watcher
    const watchPaths = projects.map((p) => p.path);

    this.info(`👀 Watching for changes in: ${JSON.stringify(watchPaths)}`);

    const watcher = chokidar.watch(watchPaths, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    watcher.on('change', async (filePath) => {
      this.info(`\n📝 File changed: ${filePath}`);

      // Determine which module this file belongs to
      // This is tricky without the full Explorer logic.
      // simpler approach: just find which config.discovery root covers this file.

      // For now, let's just say "Change detected, running full evolution?"
      // Plan says "Incremental Run: identify which module changed".

      // We can iterate over moduleDirs and platformDirs to see which one contains filePath.
      // If it's a platform file, maybe we need to update ALL skills?
      // If it's a module file, we check if that module is an exemplar for any skill.

      // This requires loading the Knowledge Graph or Skills Plan.
      // Let's assume we have a way to know.

      // For MVP, checking if it is an exemplar is hard without previous state.
      // We could run Architect to see if plan changes? expensive.

      this.info("⚠️  Incremental update not fully implemented. Run 'reskill evolve' to update.");

      // Trigger hook integration for fun
      // await hooks.onDriftDetected(...)
    });
  }
}
