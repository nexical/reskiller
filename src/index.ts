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
          skillPath: path.join(SKILLS_DIR, skillName),
          truthPath: modulePath,
        };

        // Ensure skill directory exists
        if (!fs.existsSync(target.skillPath)) {
          fs.mkdirSync(target.skillPath, { recursive: true });
        }

        try {
          const canonFile = stageAuditor(target);
          const driftFile = stageCritic(target, canonFile);
          stageInstructor(target, canonFile, driftFile);
        } catch (error) {
          console.error(`❌ Failed to evolve skill ${skillName}:`, error);
        }
      }
    }

    console.info('\n📚 Updating Skill Index in GEMINI.md...');
    await updateGeminiSystemPrompt();
    console.info('✅ GEMINI.md updated.');
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

    // Ensure skill directory exists
    if (!fs.existsSync(target.skillPath)) {
      fs.mkdirSync(target.skillPath, { recursive: true });
    }

    const canonFile = stageAuditor(target);
    const driftFile = stageCritic(target, canonFile);
    stageInstructor(target, canonFile, driftFile);

    console.info('\n📚 Updating Skill Index in GEMINI.md...');
    await updateGeminiSystemPrompt();
    console.info('Refinement complete.');
  });

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

async function updateGeminiSystemPrompt() {
  const geminiPath = 'GEMINI.md'; // Root directory
  if (!fs.existsSync(geminiPath)) {
    console.error('❌ GEMINI.md not found in root.');
    return;
  }

  const skills = fs.readdirSync(SKILLS_DIR).filter((file) => {
    return fs.statSync(path.join(SKILLS_DIR, file)).isDirectory();
  });

  const skillLines: string[] = [];

  for (const skill of skills) {
    const skillMdPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      // Simple regex to parse frontmatter description
      const match = content.match(/^description:\s*(.*)$/m);
      const description = match ? match[1].trim() : 'No description provided.';

      // Get absolute path for the file link
      const absPath = path.resolve(skillMdPath);
      skillLines.push(`- **[${skill}](file://${absPath})**: ${description}`);
    }
  }

  const geminiContent = fs.readFileSync(geminiPath, 'utf-8');
  const sectionHeader = '## 6. Skill Index';

  // Split content by the header
  const parts = geminiContent.split(sectionHeader);
  if (parts.length < 2) {
    console.error('❌ Could not find "## 6. Skill Index" section in GEMINI.md');
    return;
  }

  const preSection = parts[0];
  // The post section might contain content after the list. 
  // We assume the list goes until the end of file or next H2. 
  // Based on current GEMINI.md, it's the last section. 
  // But let's be safe and look for the next '## '
  const remainingCheck = parts[1];
  const nextSectionIndex = remainingCheck.substring(1).search(/^## /m); // Skip first char to find next

  let postSection = '';
  if (nextSectionIndex !== -1) {
    // There is another section after
    postSection = remainingCheck.substring(nextSectionIndex + 1); // +1 because we skipped one char
  }

  const newSectionContent = `\n\nYou have access to the following specialized skills. Use them to perform complex tasks correctly.\n\n${skillLines.join('\n')}\n\n`;

  const newContent = preSection + sectionHeader + newSectionContent + postSection;
  fs.writeFileSync(geminiPath, newContent, 'utf-8');
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
