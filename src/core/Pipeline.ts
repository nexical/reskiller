import * as fs from 'node:fs';
import * as path from 'node:path';
import { Target } from '../types.js';
import { ReskillConfig } from '../config.js';
import { AgentRunner } from '../agents/AgentRunner.js';
import { logger } from './Logger.js';

const TMP_DIR = '.agent/tmp/reskill';

export function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

export async function stageAuditor(target: Target, config: ReskillConfig): Promise<string> {
  logger.info(`🕵️  Auditing ${target.name}...`);
  const outputFile = path.join(TMP_DIR, `${target.name.replace(/\s+/g, '-')}-canon.json`);
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

  await AgentRunner.run('Auditor', 'agents/auditor.md', {
    module_path: target.truthPath,
    output_file: outputFile,
    constitution: config.constitution, // Pass as object, AgentRunner will flatten
  });
  return outputFile;
}

export async function stageCritic(
  target: Target,
  canonFile: string,
  config: ReskillConfig,
): Promise<string> {
  logger.info(`⚖️  Critiquing ${target.name}...`);
  const outputFile = path.join(TMP_DIR, `${target.name.replace(/\s+/g, '-')}-drift.md`);
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

  await AgentRunner.run('Critic', 'agents/critic.md', {
    audit_file: canonFile,
    doc_file: path.join(target.skillPath, 'SKILL.md'),
    skill_dir: target.skillPath,
    output_file: outputFile,
    constitution: config.constitution,
  });
  return outputFile;
}

export async function stageInstructor(
  target: Target,
  canonFile: string,
  reportFile: string,
  config: ReskillConfig,
) {
  logger.info(`✍️  Rewriting ${target.name}...`);
  await AgentRunner.run('Instructor', 'agents/instructor.md', {
    audit_file: canonFile,
    report_file: reportFile,
    target_file: path.join(target.skillPath, 'SKILL.md'),
    skill_dir: target.skillPath,
    constitution: config.constitution,
  });
}

export async function updateContextFiles(config: ReskillConfig) {
  const skills = fs.readdirSync(config.skillsDir).filter((file) => {
    return fs.statSync(path.join(config.skillsDir, file)).isDirectory();
  });

  const skillLines: string[] = [];

  for (const skill of skills) {
    const skillMdPath = path.join(config.skillsDir, skill, 'SKILL.md');
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

  const newSectionContent = `\n\nYou have access to the following specialized skills. Use them to perform complex tasks correctly.\n\n${skillLines.join('\n')}\n\n`;

  for (const contextFile of config.outputs.contextFiles) {
    if (!fs.existsSync(contextFile)) {
      logger.warn(`Context file not found: ${contextFile}`);
      continue;
    }

    const fileContent = fs.readFileSync(contextFile, 'utf-8');

    // Check for generic marker (e.g. <skills> or ## Skill Index)
    let newContent = fileContent;

    if (fileContent.includes('<skills>') && fileContent.includes('</skills>')) {
      newContent = fileContent.replace(
        /<skills>[\s\S]*?<\/skills>/,
        `<skills>\n${newSectionContent}</skills>`,
      );
    } else if (fileContent.includes('## 6. Skill Index')) {
      // Legacy fallback
      const parts = fileContent.split('## 6. Skill Index');
      const preSection = parts[0];
      const remainingCheck = parts[1];
      const nextSectionIndex = remainingCheck.substring(1).search(/^## /m);
      let postSection = '';
      if (nextSectionIndex !== -1) {
        postSection = remainingCheck.substring(nextSectionIndex + 1);
      }
      newContent = preSection + '## 6. Skill Index' + newSectionContent + postSection;
    } else {
      logger.warn(`No <skills> tag or Skill Index section found in ${contextFile}. appending...`);
      newContent = fileContent + '\n\n<skills>\n' + newSectionContent + '</skills>';
    }

    fs.writeFileSync(contextFile, newContent, 'utf-8');
    logger.info(`Updated ${contextFile}`);
  }
}
