import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRunner } from '../agents/AgentRunner.js';
import { SkillPlan } from '../types.js';
import { logger } from './Logger.js';

export class Architect {
  private skillsDir: string;
  private tmpDir: string;

  constructor(skillsDir: string, tmpDir: string) {
    this.skillsDir = skillsDir;
    this.tmpDir = tmpDir;
  }

  async strategize(knowledgeGraphPath: string): Promise<SkillPlan> {
    logger.info('🏗️ Architect: Designing Skill Portfolio...');

    const skills = this.listSkills();
    const skillsFile = path.join(this.tmpDir, 'current-skills.json');
    fs.writeFileSync(skillsFile, JSON.stringify(skills, null, 2));

    const outputFile = path.join(this.tmpDir, 'skill-plan.json');

    AgentRunner.run('Architect', 'agents/architect.md', {
      knowledge_graph_file: knowledgeGraphPath,
      skills_list: skillsFile,
      output_file: outputFile,
    });

    if (fs.existsSync(outputFile)) {
      return JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    }
    return { plan: [] };
  }

  private listSkills() {
    if (!fs.existsSync(this.skillsDir)) return [];
    return fs
      .readdirSync(this.skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({
        name: d.name,
        path: path.join(this.skillsDir, d.name),
      }));
  }
}
