import { describe, it, expect, vi, beforeEach } from 'vitest';
import EvolveCommand from '../../../src/commands/evolve.js';
import * as configMod from '../../../src/config.js';
import { Explorer } from '../../../src/core/Explorer.js';
import { Architect } from '../../../src/core/Architect.js';
import { hooks } from '../../../src/core/Hooks.js';
import * as Pipeline from '../../../src/core/Pipeline.js';
import { CLI } from '@nexical/cli-core';

vi.mock('../../../src/config.js');
vi.mock('../../../src/core/Explorer.js', () => {
  return {
    Explorer: vi.fn(),
  };
});
vi.mock('../../../src/core/Architect.js', () => {
  return {
    Architect: vi.fn(),
  };
});
vi.mock('../../../src/core/Hooks.js');
vi.mock('../../../src/core/Pipeline.js');

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('EvolveCommand', () => {
  let command: EvolveCommand;
  const mockConfig = {
    input: {
      platformDirs: [],
      moduleDirs: [],
    },
    skillsDir: 'skills',
    constitution: {},
  };

  beforeEach(() => {
    vi.resetAllMocks();
    command = new EvolveCommand(mockCli);
    command.info = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();
    command.success = vi.fn();

    vi.mocked(configMod.loadConfig).mockReturnValue(
      mockConfig as unknown as configMod.ReskillConfig,
    );
  });

  it('should run the evolution pipeline', async () => {
    vi.mocked(Explorer).mockImplementation(function () {
      return {
        discover: vi.fn().mockResolvedValue({}),
      } as unknown as Explorer;
    });
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            {
              type: 'create_skill',
              target_skill: 'test-skill',
              exemplar_module: 'mod/path',
            },
          ],
        }),
      } as unknown as Architect;
    });

    await command.run();

    expect(Pipeline.ensureTmpDir).toHaveBeenCalled();
    expect(Pipeline.stageAuditor).toHaveBeenCalled();
    expect(Pipeline.stageCritic).toHaveBeenCalled();
    expect(hooks.onDriftDetected).toHaveBeenCalled();
    expect(Pipeline.stageInstructor).toHaveBeenCalled();
    expect(hooks.onSkillUpdated).toHaveBeenCalled();
    expect(Pipeline.updateContextFiles).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('Context files updated'));
  });

  it('should skip items missing name or path', async () => {
    vi.mocked(Explorer).mockImplementation(function () {
      return {
        discover: vi.fn().mockResolvedValue({}),
      } as unknown as Explorer;
    });
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            { type: 'create_skill', target_skill: undefined }, // Missing name
            { type: 'create_skill', target_skill: 's1', exemplar_module: undefined }, // Missing path
          ],
        }),
      } as unknown as Architect;
    });

    await command.run();

    expect(Pipeline.stageAuditor).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledTimes(2);
  });
});
