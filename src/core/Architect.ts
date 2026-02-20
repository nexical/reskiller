import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRunner } from '../agents/AgentRunner.js';
import { SkillPlan } from '../types.js';
import { logger } from './Logger.js';

export class Architect {
  private bundleDir: string;
  private tmpDir: string;
  private edit: boolean;

  constructor(bundleDir: string, tmpDir: string, edit: boolean = false) {
    this.bundleDir = bundleDir;
    this.tmpDir = tmpDir;
    this.edit = edit;
  }

  async strategize(knowledgeGraphPath: string, recommendationsFile?: string): Promise<SkillPlan> {
    logger.info('🏗️ Architect: Designing Skill Portfolio...');

    const skills = this.listSkills();
    const skillsFile = path.join(this.tmpDir, 'current-skills.json');
    fs.writeFileSync(skillsFile, JSON.stringify(skills, null, 2));

    const outputFile = path.join(this.tmpDir, 'skill-plan.json');

    await AgentRunner.run('Architect', 'agents/architect.md', {
      knowledge_graph_file: knowledgeGraphPath,
      skills_list: skillsFile,
      output_file: outputFile,
      edit_mode: this.edit,
      recommendations_file: recommendationsFile,
    });

    if (fs.existsSync(outputFile)) {
      return JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    }
    return { plan: [] };
  }

  private listSkills() {
    if (!fs.existsSync(this.bundleDir)) return [];
    return fs
      .readdirSync(this.bundleDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({
        name: d.name,
        path: path.join(this.bundleDir, d.name),
      }));
  }
}
