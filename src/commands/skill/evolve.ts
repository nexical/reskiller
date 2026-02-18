import { BaseCommand } from '@nexical/cli-core';
import { ReskillConfig, getReskillConfig } from '../../config.js';
import { ensureSymlinks } from '../../core/Symlinker.js';
import { Explorer } from '../../core/Explorer.js';
import { Architect } from '../../core/Architect.js';
import { ProjectScanner } from '../../core/ProjectScanner.js';
import { Bundler } from '../../core/Bundler.js';
import { hooks } from '../../core/Hooks.js';
import {
  ensureTmpDir,
  stageAuditor,
  stageCritic,
  stageInstructor,
  updateContextFiles,
} from '../../core/Pipeline.js';
import { Target } from '../../types.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

const TMP_DIR = '.agent/tmp/reskill';

export default class EvolveCommand extends BaseCommand {
  static description = 'Full cycle: Explore -> Strategize -> Execute';
  static args = {
    args: [
      {
        name: 'directory',
        description: 'Optional directory to scope the evolution to',
        required: false,
      },
    ],
  };

  async run(options: { directory?: string } = {}) {
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

    ensureTmpDir();

    // Resolve skillsDir
    const root = this.projectRoot || process.cwd();
    const resolvedSkillsDir = path.resolve(root, config.skillsDir);

    // Resolve scope directory if provided
    let scope: string | undefined;
    if (options.directory) {
      scope = path.resolve(root, options.directory);
      this.info(`🎯 Scoping evolution to: ${scope}`);
      if (!fs.existsSync(scope)) {
        this.error(`❌ Scoped directory does not exist: ${scope}`);
        return;
      }
    }

    // 0. Discovery & Bundling
    this.info('🔭 Discovering projects and bundling skills...');
    const projectScanner = new ProjectScanner(config, root);
    const projects = await projectScanner.scan(scope);
    this.info(`✅ Found ${projects.length} projects.`);
    for (const p of projects) {
      this.info(`   - ${p.name} (${path.relative(process.cwd(), p.path)})`);
    }

    // 0.5 Build Distributed Skill Index
    const distributedSkillIndex = new Map<string, string>();
    for (const p of projects) {
      if (fs.existsSync(p.skillDir)) {
        try {
          const skillsInProject = fs.readdirSync(p.skillDir, { withFileTypes: true });
          for (const dirent of skillsInProject) {
            if (dirent.isDirectory()) {
              distributedSkillIndex.set(dirent.name, path.join(p.skillDir, dirent.name));
            }
          }
        } catch (e) {
          this.warn(`⚠️  Failed to read skill directory for project ${p.name}: ${e}`);
        }
      }
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
    const architect = new Architect(resolvedSkillsDir, TMP_DIR);
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

        // RESOLVE TARGET PATH
        let targetSkillPath = path.join(resolvedSkillsDir, skillName);
        if (distributedSkillIndex.has(skillName)) {
          targetSkillPath = distributedSkillIndex.get(skillName)!;
          this.info(`📍 Targeting distributed skill at: ${targetSkillPath}`);
        } else {
          this.info(`📍 Targeting global skill at: ${targetSkillPath}`);
        }

        const target: Target = {
          name: skillName,
          skillPath: targetSkillPath,
          truthPath: modulePath,
        };

        // Ensure skill directory exists
        if (!fs.existsSync(target.skillPath)) {
          fs.mkdirSync(target.skillPath, { recursive: true });
        }

        try {
          const canonFile = await stageAuditor(target, config);
          const driftFile = await stageCritic(target, canonFile, config);
          await hooks.onDriftDetected(target, driftFile);

          await stageInstructor(target, canonFile, driftFile, config);
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
