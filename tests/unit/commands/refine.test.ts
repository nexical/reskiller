import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refineCommand } from '../../../src/commands/refine.js';
import * as Pipeline from '../../../src/core/Pipeline.js';
import * as configMod from '../../../src/config.js';

vi.mock('../../../src/core/Pipeline.js');
vi.mock('../../../src/config.js');
vi.mock('../../../src/core/Symlinker.js');
vi.mock('../../../src/core/Hooks.js');
vi.mock('node:fs');

describe('refineCommand', () => {
  const mockConfig = {
    skillsDir: '/skills',
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

    await expect(refineCommand('skill', 'module')).rejects.toThrow('Exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should refine a single skill', async () => {
    await refineCommand('MySkill', '/path/to/module');

    expect(Pipeline.ensureTmpDir).toHaveBeenCalled();
    expect(Pipeline.stageAuditor).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MySkill', truthPath: '/path/to/module' }),
      mockConfig,
    );
    expect(Pipeline.updateContextFiles).toHaveBeenCalled();
  });
});
