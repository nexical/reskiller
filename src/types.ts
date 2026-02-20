import { ReskillConfigOverrides } from './config.js';

export interface Target {
  name: string;
  skillPath: string;
  patternPath: string;
  overrides?: ReskillConfigOverrides;
}

export interface AgentConfig {
  name: string;
  promptPath: string;
  args: Record<string, string>;
}

export interface SkillPlanItem {
  type: 'create_skill' | 'update_skill' | 'merge_skills' | 'delete_skill';
  name?: string;
  target_skill?: string;
  pattern_path?: string;
  reasoning: string;
}

export interface SkillPlan {
  plan: SkillPlanItem[];
}
