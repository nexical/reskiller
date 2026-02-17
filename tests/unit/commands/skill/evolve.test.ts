import { describe, it, expect, vi, beforeEach } from 'vitest';
import EvolveCommand from '../../../../src/commands/skill/evolve.js';
import * as configMod from '../../../../src/config.js';
import { Explorer } from '../../../../src/core/Explorer.js';
import { Architect } from '../../../../src/core/Architect.js';
import { ProjectScanner } from '../../../../src/core/ProjectScanner.js';
import { Bundler } from '../../../../src/core/Bundler.js';
import * as Pipeline from '../../../../src/core/Pipeline.js';
import { CLI } from '@nexical/cli-core';

vi.mock('../../../../src/config.js');
vi.mock('../../../../src/core/Explorer.js');
vi.mock('../../../../src/core/Architect.js');
vi.mock('../../../../src/core/ProjectScanner.js');
vi.mock('../../../../src/core/Bundler.js');
vi.mock('../../../../src/core/Hooks.js');
vi.mock('../../../../src/core/Pipeline.js');

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('EvolveCommand', () => {
  let command: EvolveCommand;
  const mockConfig = {
    discovery: { root: '.', markers: ['.skills'], ignore: [], depth: 1 },
    skillsDir: 'skills',
    constitution: { architecture: 'Test' },
    outputs: { contextFiles: [] },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    command = new EvolveCommand(mockCli);
    // Mock BaseCommand logger methods
    command.info = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();
    command.success = vi.fn();

    // Inject config as if from CLI
    // @ts-expect-error - Mocking protected method
    command.config = { reskill: mockConfig };

    vi.mocked(configMod.getReskillConfig).mockReturnValue(
      mockConfig as unknown as configMod.ReskillConfig,
    );

    // Class mocks
    vi.mocked(ProjectScanner).mockImplementation(function () {
      return {
        scan: vi.fn().mockResolvedValue([]),
      } as unknown as ProjectScanner;
    });

    vi.mocked(Bundler).mockImplementation(function () {
      return {
        bundle: vi.fn().mockResolvedValue(undefined),
        getBundleDir: vi.fn().mockReturnValue('.reskill/skills'),
      } as unknown as Bundler;
    });

    vi.mocked(Explorer).mockImplementation(function () {
      return {
        discover: vi.fn().mockResolvedValue('kg.json'),
      } as unknown as Explorer;
    });

    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({ plan: [] }),
      } as unknown as Architect;
    });
  });

  it('should run the evolution pipeline', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'test-skill', exemplar_module: 'path' }],
        }),
      } as unknown as Architect;
    });

    await command.run();
    expect(Pipeline.ensureTmpDir).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('Context files updated'));
  });

  it('should skip items missing name or path', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            { type: 'create_skill', target_skill: undefined },
            { type: 'create_skill', target_skill: 's1', exemplar_module: undefined },
          ],
        }),
      } as unknown as Architect;
    });

    await command.run();
    expect(Pipeline.stageAuditor).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledTimes(2);
  });
});
