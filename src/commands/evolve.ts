import { loadConfig } from '../config.js';
import { ensureSymlinks } from '../core/Symlinker.js';
import { Explorer } from '../core/Explorer.js';
import { Architect } from '../core/Architect.js';
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

export async function evolveCommand() {
  let config;
  try {
    config = loadConfig();
  } catch {
    console.error('❌ Missing reskill.config.json. Run "reskill init" first.');
    process.exit(1);
    return; // Reachable only if we mock process.exit
  }

  ensureTmpDir();

  // Ensure symlinks are set up
  ensureSymlinks(config);

  // 1. Explore
  // Use config for platformDirs and moduleDirs
  const { platformDirs, moduleDirs } = config.input;

  const explorer = new Explorer(moduleDirs, platformDirs, config.constitution, TMP_DIR);
  const knowledgeGraph = await explorer.discover();

  // 2. Strategize
  const architect = new Architect(config.skillsDir, TMP_DIR);
  const plan = await architect.strategize(knowledgeGraph);

  console.info('\n📋 Skill Plan Proposed by Architect:');
  console.info(JSON.stringify(plan, null, 2));

  // 3. Execute Loop
  console.info('\n🚀 Executing Skill Evolution Plan...');

  for (const item of plan.plan) {
    if (item.type === 'create_skill' || item.type === 'update_skill') {
      const skillName = item.target_skill || item.name;
      const modulePath = item.exemplar_module;

      if (!skillName) {
        console.warn('⚠️  Skipping item: missing skill name', item);
        continue;
      }

      if (!modulePath) {
        console.warn(`⚠️  Skipping ${skillName}: missing exemplar module (truth path)`, item);
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
        console.error(`❌ Failed to evolve skill ${skillName}:`, error);
      }
    }
  }

  console.info('\n📚 Updating Context Files...');
  await updateContextFiles(config);
  console.info('✅ Context files updated.');
}
