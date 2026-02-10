import { loadConfig } from '../config.js';
import { ensureSymlinks } from '../core/Symlinker.js';
import { hooks } from '../core/Hooks.js';
import {
  ensureTmpDir,
  stageAuditor,
  stageCritic,
  stageInstructor,
  updateContextFiles,
} from '../core/Pipeline.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

export async function refineCommand(skillName: string, modulePath: string) {
  let config;
  try {
    config = loadConfig();
  } catch {
    console.error('❌ Missing reskill.config.json. Run "reskill init" first.');
    process.exit(1);
    return;
  }

  ensureTmpDir();

  // Ensure symlinks are set up
  ensureSymlinks(config);

  console.info(`Refining ${skillName} using ${modulePath}...`);

  const target = {
    name: skillName,
    skillPath: path.join(config.skillsDir, skillName),
    truthPath: modulePath,
  };

  // Ensure skill directory exists
  if (!fs.existsSync(target.skillPath)) {
    fs.mkdirSync(target.skillPath, { recursive: true });
  }

  const canonFile = stageAuditor(target, config);
  const driftFile = stageCritic(target, canonFile, config);
  await hooks.onDriftDetected(target, driftFile);

  stageInstructor(target, canonFile, driftFile, config);
  await hooks.onSkillUpdated(target);

  console.info('\n📚 Updating Context Files...');
  await updateContextFiles(config);
  console.info('Refinement complete.');
}
