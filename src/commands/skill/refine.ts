import { BaseCommand, type CommandDefinition } from '@nexical/cli-core';
import { ReskillConfig, getReskillConfig } from '../../config.js';
import { ensureSymlinks } from '../../core/Symlinker.js';
import { hooks } from '../../core/Hooks.js';
import { ProjectScanner } from '../../core/ProjectScanner.js';
import { logger } from '../../core/Logger.js';
import {
  ensureTmpDir,
  stageAuditor,
  stageCritic,
  stageInstructor,
  updateContextFiles,
} from '../../core/Pipeline.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

export default class RefineCommand extends BaseCommand {
  static description = 'Manual single-skill refinement';

  static args: CommandDefinition = {
    args: [
      {
        name: 'skillName',
        description: 'Name of the skill to refine',
        required: true,
      },
      {
        name: 'modulePath',
        description: 'Path to the exemplar module',
        required: true,
      },
    ],
  };

  async run(options: { skillName: string; modulePath: string }) {
    logger.setCommand(this);
    logger.setDebug(this.globalOptions.debug);

    const { skillName, modulePath } = options;

    let config;
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

    // Ensure tmp dir
    ensureTmpDir();

    // Ensure symlinks are set up
    ensureSymlinks(config);

    this.info(`Refining ${skillName} using ${modulePath}...`);

    const root = this.projectRoot || process.cwd();
    const projectScanner = new ProjectScanner(config, root);
    const projects = await projectScanner.scan();

    // Try to find if this skill already exists in any project
    let targetSkillPath: string | undefined;
    let targetOverrides: Partial<ReskillConfig> | undefined;

    for (const p of projects) {
      const potentialPath = path.join(p.skillDir, skillName);
      if (fs.existsSync(potentialPath)) {
        targetSkillPath = potentialPath;
        targetOverrides = p.overrides;
        break;
      }
    }

    // Fallback: Use the first project's .skills directory or the root's .skills
    if (!targetSkillPath) {
      if (projects.length > 0) {
        targetSkillPath = path.join(projects[0].skillDir, skillName);
        targetOverrides = projects[0].overrides;
      } else {
        targetSkillPath = path.join(root, '.skills', skillName);
      }
    }

    const target = {
      name: skillName,
      skillPath: targetSkillPath,
      truthPath: modulePath,
      overrides: targetOverrides,
    };

    // Ensure skill directory exists
    if (!fs.existsSync(target.skillPath)) {
      fs.mkdirSync(target.skillPath, { recursive: true });
    }

    const canonFile = await stageAuditor(target, config);
    const driftFile = await stageCritic(target, canonFile, config);
    await hooks.onDriftDetected(target, driftFile);

    await stageInstructor(target, canonFile, driftFile, config);
    await hooks.onSkillUpdated(target);

    logger.info('📚 Updating Context Files...');
    await updateContextFiles(config);
    logger.success('Refinement complete.');
  }
}
