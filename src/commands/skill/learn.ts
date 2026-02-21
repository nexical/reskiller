import { BaseCommand } from '@nexical/cli-core';
import { ReskillConfig, getReskillConfig, ReskillConfigOverrides } from '../../config.js';
import { Explorer } from '../../core/Explorer.js';
import { Architect } from '../../core/Architect.js';
import { ProjectScanner } from '../../core/ProjectScanner.js';
import { Bundler } from '../../core/Bundler.js';
import { hooks } from '../../core/Hooks.js';
import { ensureTmpDir, stageAuditor, stageCritic, stageInstructor } from '../../core/Pipeline.js';
import { Target } from '../../types.js';
import { logger } from '../../core/Logger.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

const TMP_DIR = '.agent/tmp/reskill';

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
    ],
  };

  async run(options: { directory?: string; edit?: boolean } = {}) {
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

    ensureTmpDir();

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

    // 0. Discovery & Bundling
    logger.info('🔭 Discovering projects and bundling skills globally...');
    const projectScanner = new ProjectScanner(config, root);

    // Always bundle the entire project to ensure the skill integration context is complete
    const allProjects = await projectScanner.scan();
    // Scope limits what we explore and strategize on
    const projects = scope ? await projectScanner.scan(scope) : allProjects;

    logger.info(`✅ Found ${projects.length} target projects${scope ? ' in scope' : ''}:`);
    for (const p of projects) {
      logger.info(`   - ${p.name} (${path.relative(root, p.path)})`);
    }

    // 0.5 Build Distributed Skill Index
    const distributedSkillIndex = new Map<
      string,
      { path: string; overrides?: ReskillConfigOverrides }
    >();
    for (const p of allProjects) {
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
    await bundler.bundle(allProjects);
    const bundleDir = bundler.getBundleDir();

    // 1. Explore
    // Architect reads from the distributed workspace paths directly instead of a centralized bundle,
    // or we bundle explicitly for the Architect once?
    // The previous code bundled here so the Architect could read from `bundleDir`.
    // Let's create a temporary bundle for the Architect, or just let Bundler run here, but wait, the instruction is:
    // "clean the skill integration directory before generating... move initialization in evolve to after"
    // I will just use the bundler here into a temp dir for architect, OR I can just let it bundle to the main dir,
    // but the user's intent is probably: "Run `nexical skill setup` at the end to finalize".
    // Actually, I'll just leave the Discovery, but move Bundler entirely. Wait, Architect *needs* `bundleDir`.
    // I will initialize `bundleDir` by running `Bundler` here but WITHOUT symlinking and context updating?
    // Let's look at what `Bundler` does. It copies files to `.reskill/skills`.
    // If we clean `.reskill/skills` in `setup`, and call `setup` at the end of `evolve`, that satisfies everything.
    // I am going to delete the `Bundler` and `Symlinker` logic from here and just call `new SetupCommand().run()` at the end.
    // WAIT: `Architect` is passed `bundleDir`. So `Bundler` MUST run before Architect!
    // I will call `SetupCommand` *before* Architect? No, the user explicitly said "move the initialization in the evolve and refine commands to after the skills are generated, updated, or refined".
    // Therefore, `evolve` must *not* bundle before generation. But `Architect` needs `bundleDir`. Let's re-read Architect! It reads from `.reskill/skills`.
    // If I don't bundle before Architect, it explores nothing. The simplest approach: keep `Bundler` here, but move the Symlink/Initializer/Context to the end. Or call Setup twice.
    // Let's just execute `SetupCommand` at the end!
    const recommendationsFile = path.resolve(root, '.reskill', 'recommendations.md');

    const explorer = new Explorer(projects, config, TMP_DIR, options.edit);
    const knowledgeGraph = await explorer.discover(options.edit ? recommendationsFile : undefined);

    // 2. Strategize
    const architect = new Architect(bundleDir, TMP_DIR, config, options.edit);
    const plan = await architect.strategize(
      knowledgeGraph,
      options.edit ? recommendationsFile : undefined,
    );

    logger.debug('Skill Plan Proposed by Architect:', plan);

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
          if (allProjects.length === 0) {
            logger.error(`Cannot create skill ${skillName}: no projects found to host it.`);
            continue;
          }
          const defaultProject = allProjects[0];
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
                TMP_DIR,
                `${target.name.replace(/\\s+/g, '-')}-gauntlet.txt`,
              );
              fs.writeFileSync(gauntletReportPath, output);
              logger.info('🔄 Feeding errors back to instructor for correction...');
            }
          }

          if (!verificationSuccess) {
            logger.error(`Failed to verify skill ${skillName} after ${MAX_ATTEMPTS} attempts.`);
          }

          await hooks.onSkillUpdated(target);
        } catch (error) {
          logger.error(`Failed to learn skill ${skillName}: ${error}`);
        }
      }
    }

    if (!options.edit) {
      logger.info('📝 Compiling high value recommendations...');
      const driftFilesFolder = TMP_DIR;
      if (!fs.existsSync(path.dirname(recommendationsFile))) {
        fs.mkdirSync(path.dirname(recommendationsFile), { recursive: true });
      }

      const { AgentRunner } = await import('../../agents/AgentRunner.js');
      await AgentRunner.run('Recommender', 'agents/recommender.md', {
        drift_files_dir: driftFilesFolder,
        skill_plan_file: path.join(TMP_DIR, 'skill-plan.json'),
        knowledge_graph_file: path.join(TMP_DIR, 'knowledge-graph.json'),
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
