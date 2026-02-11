import { describe, it, expect, vi, beforeEach } from 'vitest';
import RefineCommand from '../../../../src/commands/skill/refine.js';
import * as configMod from '../../../../src/config.js';
import { hooks } from '../../../../src/core/Hooks.js';
import * as Pipeline from '../../../../src/core/Pipeline.js';
import { CLI } from '@nexical/cli-core';

vi.mock('../../../../src/config.js');
vi.mock('../../../../src/core/Hooks.js');
vi.mock('../../../../src/core/Pipeline.js');

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('RefineCommand', () => {
  let command: RefineCommand;
  const mockConfig = {
    skillsDir: 'skills',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    command = new RefineCommand(mockCli);
    command.info = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();
    command.success = vi.fn();

    vi.mocked(configMod.loadConfig).mockReturnValue(
      mockConfig as unknown as configMod.ReskillConfig,
    );
  });

  it('should run refinement pipeline', async () => {
    await command.run({ skillName: 'test-skill', modulePath: 'mod/path' });

    expect(Pipeline.ensureTmpDir).toHaveBeenCalled();
    expect(Pipeline.stageAuditor).toHaveBeenCalled();
    expect(Pipeline.stageCritic).toHaveBeenCalled();
    expect(hooks.onDriftDetected).toHaveBeenCalled();
    expect(Pipeline.stageInstructor).toHaveBeenCalled();
    expect(hooks.onSkillUpdated).toHaveBeenCalled();
    expect(Pipeline.updateContextFiles).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('Refinement complete'));
  });
});
