import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evolveCommand } from '../../../src/commands/evolve.js';
import * as Pipeline from '../../../src/core/Pipeline.js';
import * as configMod from '../../../src/config.js';
import { Explorer } from '../../../src/core/Explorer.js';
import { Architect } from '../../../src/core/Architect.js';

vi.mock('../../../src/core/Pipeline.js');
vi.mock('../../../src/config.js');
vi.mock('../../../src/core/Explorer.js');
vi.mock('../../../src/core/Architect.js');
vi.mock('../../../src/core/Symlinker.js');
vi.mock('../../../src/core/Hooks.js');
vi.mock('node:fs');

describe('evolveCommand', () => {
  const mockConfig = {
    skillsDir: '/skills',
    input: { platformDirs: [], moduleDirs: [] },
    constitution: {},
    outputs: { contextFiles: [] },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(configMod.loadConfig).mockReturnValue(mockConfig as any);
  });

  it('should exit if config missing', async () => {
    vi.mocked(configMod.loadConfig).mockImplementation(() => {
      throw new Error('No config');
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Exit called');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(evolveCommand()).rejects.toThrow('Exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should run full evolution cycle', async () => {
    const mockGraph = {};
    const mockPlan = {
      plan: [
        { type: 'create_skill', target_skill: 'Skill1', exemplar_module: '/module' },
        { type: 'update_skill', name: 'Skill2', exemplar_module: '/module2' },
        { type: 'skip_me' },
      ],
    };

    vi.mocked(Explorer).mockImplementation(function () {
      return { discover: vi.fn().mockResolvedValue(mockGraph) } as unknown as Explorer;
    });
    vi.mocked(Architect).mockImplementation(function () {
      return { strategize: vi.fn().mockResolvedValue(mockPlan) } as unknown as Architect;
    });

    await evolveCommand();

    expect(Pipeline.ensureTmpDir).toHaveBeenCalled();
    expect(Pipeline.stageAuditor).toHaveBeenCalledTimes(2); // Two valid skills
    expect(Pipeline.updateContextFiles).toHaveBeenCalled();
  });

  it('should skip items with missing data', async () => {
    const mockPlan = {
      plan: [
        { type: 'create_skill', target_skill: '', exemplar_module: '/module' }, // Missing name
        { type: 'update_skill', name: 'Skill2', exemplar_module: '' }, // Missing module
      ],
    };
    vi.mocked(Explorer).mockImplementation(function () {
      return { discover: vi.fn().mockResolvedValue({}) } as unknown as Explorer;
    });
    vi.mocked(Architect).mockImplementation(function () {
      return { strategize: vi.fn().mockResolvedValue(mockPlan) } as unknown as Architect;
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await evolveCommand();

    expect(Pipeline.stageAuditor).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('should handle errors during skill evolution', async () => {
    const mockPlan = {
      plan: [{ type: 'create_skill', target_skill: 'Skill1', exemplar_module: '/module' }],
    };
    (Explorer as any).mockImplementation(function () {
      return { discover: vi.fn().mockResolvedValue({}) };
    });
    (Architect as any).mockImplementation(function () {
      return { strategize: vi.fn().mockResolvedValue(mockPlan) };
    });

    vi.mocked(Pipeline.stageAuditor).mockImplementation(() => {
      throw new Error('Fail');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await evolveCommand();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to evolve skill'),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
