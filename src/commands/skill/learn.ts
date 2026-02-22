import { BaseCommand } from '@nexical/cli-core';
import { ReskillConfig, getReskillConfig, ReskillConfigOverrides } from '../../config.js';
import { Explorer } from '../../core/Explorer.js';
import { Architect } from '../../core/Architect.js';
import { ProjectScanner } from '../../core/ProjectScanner.js';
import { Bundler } from '../../core/Bundler.js';
import { hooks } from '../../core/Hooks.js';
import {
  ensureTmpDir,
  getTmpDir,
  stageAuditor,
  stageCritic,
  stageInstructor,
} from '../../core/Pipeline.js';
import { Target } from '../../types.js';
import { logger } from '../../core/Logger.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

export default class LearnCommand extends BaseCommand {
  static description = 'Full cycle: Explore -> Strategize -> Execute';
  static args = {
    args: [
      {
        name: 'directory',
        description: 'Optional directory to scope the learning to',
        required: false,
      },
    ],
    options: [
      {
        name: '--edit',
        description: 'Toggle editing of code implementation and pattern files',
        default: false,
      },
      {
        name: '--resume',
        description: 'Resume learning from the last failed point',
        default: false,
      },
    ],
  };

  async run(options: { directory?: string; edit?: boolean; resume?: boolean } = {}) {
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

    const root = this.projectRoot || process.cwd();

    // Resolve scope directory if provided
    let scope: string | undefined;
    if (options.directory) {
      scope = path.resolve(root, options.directory);
      logger.info(`🎯 Scoping learning to: ${scope}`);
      if (!fs.existsSync(scope)) {
        logger.error(`Scoped directory does not exist: ${scope}`);
        return;
      }
    }

    const tmpDir = getTmpDir(scope || root);
    ensureTmpDir(scope || root);

    const stateFile = path.join(tmpDir, 'state.json');
    let state: { completedSkills: string[] } = { completedSkills: [] };

    if (options.resume) {
      if (fs.existsSync(stateFile)) {
        try {
          state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
          logger.info(`🔄 Resuming from state: ${state.completedSkills.length} skills completed.`);
        } catch {
          logger.warn('Failed to parse state file. Starting fresh.');
        }
      } else {
        logger.warn('No state file found. Starting fresh.');
      }
    } else {
      // Clear state file if not resuming
      if (fs.existsSync(stateFile)) {
        fs.unlinkSync(stateFile);
      }
    }

    const saveState = () => {
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    };

    // 0. Discovery & Bundling
    logger.info('🔭 Discovering projects and bundling skills in scope...');
    const projectScanner = new ProjectScanner(config, root);

    // Only inspect projects that are within the requested scope
    const projects = await projectScanner.scan(scope);

    logger.info(`✅ Found ${projects.length} target projects${scope ? ' in scope' : ''}:`);
    for (const p of projects) {
      logger.info(`   - ${p.name} (${path.relative(root, p.path)})`);
    }

    // 0.5 Build Distributed Skill Index
    const distributedSkillIndex = new Map<
      string,
      { path: string; overrides?: ReskillConfigOverrides }
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

    const bundler = new Bundler(config, root);
    await bundler.bundle(projects);
    const bundleDir = bundler.getBundleDir();

    const skillPlanFile = path.join(tmpDir, 'skill-plan.json');
    const recommendationsFile = path.resolve(root, '.reskill', 'recommendations.md');

    let plan: {
      plan: { type: string; name?: string; target_skill?: string; pattern_path?: string }[];
    };
    let knowledgeGraph: string;

    if (
      options.resume &&
      fs.existsSync(skillPlanFile) &&
      fs.existsSync(path.join(tmpDir, 'knowledge-graph.json'))
    ) {
      logger.info('⏩ Skipping Explore and Strategize phases (resuming).');
      try {
        plan = JSON.parse(fs.readFileSync(skillPlanFile, 'utf-8'));
        knowledgeGraph = path.join(tmpDir, 'knowledge-graph.json');
        logger.debug('Loaded existing Skill Plan:', plan);
      } catch {
        logger.warn('Failed to load existing plan. Falling back to Explore and Strategize.');
        options.resume = false;
        // Proceed to regenerate
      }
    }

    // We check again since it might have been set to false if parse failed
    if (!options.resume || !plan!) {
      // 1. Explore
      const explorer = new Explorer(projects, config, tmpDir, options.edit);
      knowledgeGraph = await explorer.discover(options.edit ? recommendationsFile : undefined);

      // 2. Strategize
      const architect = new Architect(bundleDir, tmpDir, config, options.edit);
      plan = await architect.strategize(
        knowledgeGraph,
        options.edit ? recommendationsFile : undefined,
      );

      logger.debug('Skill Plan Proposed by Architect:', plan);
    }

    // 3. Execute Loop
    logger.info('🚀 Executing Skill Learning Plan...');

    for (const item of plan.plan) {
      if (item.type === 'create_skill' || item.type === 'update_skill') {
        const skillName = item.target_skill || item.name;
        const patternPath = item.pattern_path;

        if (!skillName) {
          this.warn(`⚠️  Skipping item: missing skill name ${JSON.stringify(item)}`);
          continue;
        }

        if (!patternPath) {
          this.warn(`⚠️  Skipping ${skillName}: missing pattern path ${JSON.stringify(item)}`);
          continue;
        }

        if (state.completedSkills.includes(skillName)) {
          logger.info(`⏩ Skipping ${skillName}: already completed.`);
          continue;
        }

        if (scope) {
          const resolvedPatternPath = path.resolve(root, patternPath);
          const relativeToScope = path.relative(scope, resolvedPatternPath);
          if (relativeToScope.startsWith('..') || path.isAbsolute(relativeToScope)) {
            this.warn(
              `⚠️  Skipping ${skillName}: pattern path ${patternPath} is outside the allowed scope (${scope}).`,
            );
            continue;
          }
        }

        // RESOLVE TARGET PATH
        let targetSkillPath: string;
        let targetOverrides: ReskillConfigOverrides | undefined;

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
          patternPath: patternPath,
          overrides: targetOverrides,
        };

        // Ensure skill directory exists
        if (!fs.existsSync(target.skillPath)) {
          fs.mkdirSync(target.skillPath, { recursive: true });
        }

        try {
          const canonFile = await stageAuditor(target, config, root, options.edit);
          const driftFile = await stageCritic(target, canonFile, config, root, options.edit);
          await hooks.onDriftDetected(target, driftFile);

          let verificationSuccess = false;
          let attempts = 0;
          const MAX_ATTEMPTS = 3;
          let gauntletReportPath: string | undefined = undefined;

          while (attempts < MAX_ATTEMPTS && !verificationSuccess) {
            attempts++;
            await stageInstructor(
              target,
              canonFile,
              driftFile,
              config,
              root,
              options.edit || !!gauntletReportPath,
              gauntletReportPath,
            );

            logger.info(`🔍 Verifying skill lint (Attempt ${attempts}/${MAX_ATTEMPTS})...`);
            try {
              const verifyCwd = scope || root;
              execSync('npm run lint', { cwd: verifyCwd, stdio: 'pipe' });

              verificationSuccess = true;
              logger.success(`✅ Skill ${skillName} passed verification!`);
            } catch (error: unknown) {
              const err = error as {
                stdout?: { toString(): string };
                stderr?: { toString(): string };
                message?: string;
              };
              const output =
                err.stdout?.toString() || err.stderr?.toString() || err.message || String(error);
              logger.warn(`❌ Verification failed for ${skillName}:\n${output}`);

              gauntletReportPath = path.join(
                tmpDir,
                `${target.name.replace(/\\s+/g, '-')}-gauntlet.txt`,
              );
              fs.writeFileSync(gauntletReportPath, output);
              logger.info('🔄 Feeding errors back to instructor for correction...');
            }
          }

          if (!verificationSuccess) {
            logger.error(`Failed to verify skill ${skillName} after ${MAX_ATTEMPTS} attempts.`);
          } else {
            state.completedSkills.push(skillName);
            saveState();
          }

          await hooks.onSkillUpdated(target);
        } catch (error) {
          logger.error(`Failed to learn skill ${skillName}: ${error}`);
        }
      }
    }

    if (!options.edit) {
      logger.info('📝 Compiling high value recommendations...');
      const driftFilesFolder = tmpDir;
      if (!fs.existsSync(path.dirname(recommendationsFile))) {
        fs.mkdirSync(path.dirname(recommendationsFile), { recursive: true });
      }

      const { AgentRunner } = await import('../../agents/AgentRunner.js');
      await AgentRunner.run('Recommender', 'agents/recommender.md', {
        drift_files_dir: driftFilesFolder,
        skill_plan_file: path.join(tmpDir, 'skill-plan.json'),
        knowledge_graph_file: path.join(tmpDir, 'knowledge-graph.json'),
        constitution: config.constitution,
        aiConfig: config.ai,
        output_file: recommendationsFile,
        cwd: root,
      });
      logger.success(`✅ Recommendations compiled to ${path.relative(root, recommendationsFile)}`);
    }

    // Run Setup Logic to integrate newly created/modified skills
    logger.info('⚙️ Running Skill Integration Setup...');
    const { default: SetupCommand } = await import('./setup.js');
    const setupCmd = new SetupCommand([], this.config);
    // @ts-expect-error - overriding protected property
    setupCmd.projectRoot = this.projectRoot;
    // @ts-expect-error - overriding protected property
    setupCmd.globalOptions = this.globalOptions;
    // @ts-expect-error - overriding protected property
    setupCmd.config = this.config;
    await setupCmd.run({ directory: options.directory });
  }
}
