import { describe, it, expect, vi, beforeEach } from 'vitest';
import RefineCommand from '../../../../src/commands/skill/refine.js';
import * as configMod from '../../../../src/config.js';
import { hooks } from '../../../../src/core/Hooks.js';
import * as Pipeline from '../../../../src/core/Pipeline.js';
import { CLI } from '@nexical/cli-core';
import * as fs from 'node:fs';
// import * as path from 'node:path';

vi.mock('../../../../src/config.js');
vi.mock('../../../../src/core/Hooks.js');
vi.mock('../../../../src/core/Pipeline.js', async () => {
  return await import('../../../../tests/unit/mocks/Pipeline.js');
});
vi.mock('node:fs');

// Mock Initializer dynamic import
vi.mock('../../../../src/core/Initializer.js', () => ({
  Initializer: {
    initialize: vi.fn(),
  },
}));

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

    // Inject config
    // @ts-expect-error - Mocking protected method
    command.config = { reskill: mockConfig };

    vi.mocked(configMod.getReskillConfig).mockReturnValue(
      mockConfig as unknown as configMod.ReskillConfig,
    );

    // Default FS mocks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
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

  it('should handle config errors', async () => {
    vi.mocked(configMod.getReskillConfig).mockImplementation(() => {
      throw new Error('Config Error');
    });

    await command.run({ skillName: 'test-skill', modulePath: 'mod/path' });
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Config Error'));
  });

  it('should handle non-error objects in config errors', async () => {
    vi.mocked(configMod.getReskillConfig).mockImplementation(() => {
      throw 'String Error';
    });

    await command.run({ skillName: 'test-skill', modulePath: 'mod/path' });
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('String Error'));
  });

  it('should create skill directory if missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await command.run({ skillName: 'test-skill', modulePath: 'mod/path' });

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('test-skill'), {
      recursive: true,
    });
  });
});
