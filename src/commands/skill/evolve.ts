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
import { logger } from '../../core/Logger.js';
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

    // Auto-initialize environment
    const { Initializer } = await import('../../core/Initializer.js');
    Initializer.initialize(config, this.projectRoot || process.cwd());

    ensureTmpDir();

    const root = this.projectRoot || process.cwd();

    // Resolve scope directory if provided
    let scope: string | undefined;
    if (options.directory) {
      scope = path.resolve(root, options.directory);
      logger.info(`🎯 Scoping evolution to: ${scope}`);
      if (!fs.existsSync(scope)) {
        logger.error(`Scoped directory does not exist: ${scope}`);
        return;
      }
    }

    // 0. Discovery & Bundling
    logger.info('🔭 Discovering projects and bundling skills...');
    const projectScanner = new ProjectScanner(config, root);
    const projects = await projectScanner.scan(scope);
    logger.info(`✅ Found ${projects.length} projects.`);
    for (const p of projects) {
      logger.info(`   - ${p.name} (${path.relative(process.cwd(), p.path)})`);
    }

    // 0.5 Build Distributed Skill Index
    const distributedSkillIndex = new Map<
      string,
      { path: string; overrides?: Partial<ReskillConfig> }
    >();
    for (const p of projects) {
      if (fs.existsSync(p.skillDir)) {
        try {
          const skillsInProject = fs.readdirSync(p.skillDir, { withFileTypes: true });
          for (const dirent of skillsInProject) {
            if (dirent.isDirectory()) {
              const skillName = dirent.name;
              const compositeName = `${p.name}-${skillName}`;
              distributedSkillIndex.set(compositeName, {
                path: path.join(p.skillDir, skillName),
                overrides: p.overrides,
              });
            }
          }
        } catch (e) {
          logger.warn(`Failed to read skill directory for project ${p.name}: ${e}`);
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
    const architect = new Architect(bundleDir, TMP_DIR);
    const plan = await architect.strategize(knowledgeGraph);

    logger.debug('Skill Plan Proposed by Architect:', plan);

    // 3. Execute Loop
    logger.info('🚀 Executing Skill Evolution Plan...');

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
        let targetSkillPath: string;
        let targetOverrides: Partial<ReskillConfig> | undefined;

        if (distributedSkillIndex.has(skillName)) {
          const info = distributedSkillIndex.get(skillName)!;
          targetSkillPath = info.path;
          targetOverrides = info.overrides;
          logger.info(`📍 Targeting distributed skill at: ${targetSkillPath}`);
        } else {
          // Fallback: This case shouldn't happen much with the new flattened architecture since everything is bundled
          // but if we are creating a NEW skill that isn't in the index yet, we might need a default project.
          // For now, let's assume skills are created in the first project encountered or a default if not found.
          if (projects.length === 0) {
            logger.error(`Cannot create skill ${skillName}: no projects found to host it.`);
            continue;
          }
          const defaultProject = projects[0];
          // We probably want to split the skillName back to project-skill if it follows the pattern
          // or just put it in the first project's .skills directory.
          targetSkillPath = path.join(
            defaultProject.skillDir,
            skillName.replace(`${defaultProject.name}-`, ''),
          );
          targetOverrides = defaultProject.overrides;
          logger.info(`📍 Targeting NEW skill at: ${targetSkillPath}`);
        }

        const target: Target = {
          name: skillName,
          skillPath: targetSkillPath,
          truthPath: modulePath,
          overrides: targetOverrides,
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
          logger.error(`Failed to evolve skill ${skillName}: ${error}`);
        }
      }
    }

    logger.info('📚 Updating Context Files...');
    await updateContextFiles(config);
    logger.success('Context files updated.');
  }
}
