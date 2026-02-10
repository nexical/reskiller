import { BaseCommand } from '@nexical/cli-core';
import { loadConfig } from '../config.js';
import { ensureSymlinks } from '../core/Symlinker.js';
import { Explorer } from '../core/Explorer.js';
import { Architect } from '../core/Architect.js';
import { ProjectScanner } from '../core/ProjectScanner.js';
import { Bundler } from '../core/Bundler.js';
import { hooks } from '../core/Hooks.js';
import {
  ensureTmpDir,
  stageAuditor,
  stageCritic,
  stageInstructor,
  updateContextFiles,
} from '../core/Pipeline.js';
import { Target } from '../types.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

const TMP_DIR = '.agent/tmp/reskill';

export default class EvolveCommand extends BaseCommand {
  static description = 'Full cycle: Explore -> Strategize -> Execute';

  async run() {
    let config;
    try {
      config = loadConfig();
    } catch {
      this.error('❌ Missing reskill.config.json. Run "reskill init" first.');
      process.exit(1);
      return;
    }

    ensureTmpDir();

    // 0. Discovery & Bundling
    this.info('🔭 Discovering projects and bundling skills...');
    const projectScanner = new ProjectScanner(config);
    const projects = await projectScanner.scan();

    this.info(`✅ Found ${projects.length} projects.`);
    for (const p of projects) {
      this.info(`   - ${p.name} (${path.relative(process.cwd(), p.path)})`);
    }

    const bundler = new Bundler(config);
    await bundler.bundle(projects);
    const bundleDir = bundler.getBundleDir();

    // Ensure editor symlinks point to the BUNDLED skills now
    ensureSymlinks(config, process.cwd(), bundleDir);

    // 1. Explore
    const explorer = new Explorer(projects, config.constitution, TMP_DIR);
    const knowledgeGraph = await explorer.discover();

    // 2. Strategize
    // Architect should probably look at the BUNDLED skills now, or strictly the source ones?
    // If it strategizes to CREATE skills, it should create them in the global skillsDir or local project skills?
    // For now, let's keep it using config.skillsDir (Global) to avoid breaking the "Architect" logic which might trigger file creations.
    // If we want distributed creation, that's a bigger change.
    const architect = new Architect(config.skillsDir, TMP_DIR);
    const plan = await architect.strategize(knowledgeGraph);

    this.info('\n📋 Skill Plan Proposed by Architect:');
    this.info(JSON.stringify(plan, null, 2));

    // 3. Execute Loop
    this.info('\n🚀 Executing Skill Evolution Plan...');

    for (const item of plan.plan) {
      if (item.type === 'create_skill' || item.type === 'update_skill') {
        const skillName = item.target_skill || item.name;
        const modulePath = item.exemplar_module;

        if (!skillName) {
          this.warn(`⚠️  Skipping item: missing skill name ${JSON.stringify(item)}`);
          continue;
        }

        if (!modulePath) {
          this.warn(
            `⚠️  Skipping ${skillName}: missing exemplar module (truth path) ${JSON.stringify(item)}`,
          );
          continue;
        }

        const target: Target = {
          name: skillName,
          skillPath: path.join(config.skillsDir, skillName),
          truthPath: modulePath,
        };

        // Ensure skill directory exists
        if (!fs.existsSync(target.skillPath)) {
          fs.mkdirSync(target.skillPath, { recursive: true });
        }

        try {
          const canonFile = stageAuditor(target, config);
          const driftFile = stageCritic(target, canonFile, config);
          await hooks.onDriftDetected(target, driftFile);

          stageInstructor(target, canonFile, driftFile, config);
          await hooks.onSkillUpdated(target);
        } catch (error) {
          this.error(`❌ Failed to evolve skill ${skillName}: ${error}`);
        }
      }
    }

    this.info('\n📚 Updating Context Files...');
    await updateContextFiles(config);
    this.success('✅ Context files updated.');
  }
}
