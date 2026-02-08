#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Explorer } from './core/Explorer.js';
import { Architect } from './core/Architect.js';
import { AgentRunner } from './agents/AgentRunner.js';
import { Target } from './types.js';

const program = new Command();
const TMP_DIR = '.agent/tmp/reskill';
const MODULES_DIR = 'modules';
const CORE_DIR = 'src';
const SKILLS_DIR = '.agent/skills';
const ARCH_DOC = 'ARCHITECTURE.md';
const MOD_DOC = 'MODULES.md';

program.name('reskill').description('Adaptive Learning System for Nexical Skills').version('1.0.0');

program
  .command('evolve')
  .description('Full cycle: Explore -> Strategize -> Execute')
  .action(async () => {
    ensureTmpDir();

    // 1. Explore
    // Define Paths for the new Architecture
    const moduleDirs = ['apps/backend/modules', 'apps/frontend/modules'];
    const platformDirs = [
      { name: 'core', path: 'core/src' },
      { name: 'generator', path: 'packages/generator/src' },
    ];

    const explorer = new Explorer(moduleDirs, platformDirs, TMP_DIR);
    const knowledgeGraph = await explorer.discover();

    // 2. Strategize
    const architect = new Architect(SKILLS_DIR, TMP_DIR);
    const plan = await architect.strategize(knowledgeGraph);

    console.info('\n📋 Skill Plan Proposed by Architect:');
    console.info(JSON.stringify(plan, null, 2));

    // 3. Execute Loop (Simplified Port of old script)
    // For now, we just print the plan as per V1 requirements
    console.info(
      '\nTo execute this plan, we would loop through each item and call Auditor/Critic/Instructor.',
    );
  });

program
  .command('refine <skillName> <modulePath>')
  .description('Manual single-skill refinement')
  .action(async (skillName, modulePath) => {
    ensureTmpDir();
    console.info(`Refining ${skillName} using ${modulePath}...`);

    const target = {
      name: skillName,
      skillPath: path.join(SKILLS_DIR, skillName),
      truthPath: modulePath,
    };

    const canonFile = stageAuditor(target);
    const driftFile = stageCritic(target, canonFile);
    stageInstructor(target, canonFile, driftFile);

    console.info('Refinement complete.');
  });

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// --- Legacy Pipeline Adapters (Ported from old script) ---

function stageAuditor(target: Target): string {
  console.info(`🕵️  Auditing ${target.name}...`);
  const outputFile = path.join(TMP_DIR, `${target.name.replace(/\s+/g, '-')}-canon.json`);
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

  AgentRunner.run('Auditor', 'agents/auditor.md', {
    module_path: target.truthPath,
    output_file: outputFile,
    arch_file: ARCH_DOC,
    modules_file: MOD_DOC,
  });
  return outputFile;
}

function stageCritic(target: Target, canonFile: string): string {
  console.info(`⚖️  Critiquing ${target.name}...`);
  const outputFile = path.join(TMP_DIR, `${target.name.replace(/\s+/g, '-')}-drift.md`);
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

  AgentRunner.run('Critic', 'agents/critic.md', {
    audit_file: canonFile,
    doc_file: path.join(target.skillPath, 'SKILL.md'),
    skill_dir: target.skillPath,
    output_file: outputFile,
    arch_file: ARCH_DOC,
    modules_file: MOD_DOC,
  });
  return outputFile;
}

function stageInstructor(target: Target, canonFile: string, reportFile: string) {
  console.info(`✍️  Rewriting ${target.name}...`);
  AgentRunner.run('Instructor', 'agents/instructor.md', {
    audit_file: canonFile,
    report_file: reportFile,
    target_file: path.join(target.skillPath, 'SKILL.md'),
    skill_dir: target.skillPath,
    arch_file: ARCH_DOC,
    modules_file: MOD_DOC,
  });
}

program.parse();
