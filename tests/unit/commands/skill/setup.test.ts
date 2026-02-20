import { describe, it, expect, vi, beforeEach } from 'vitest';
import SetupCommand from '../../../../src/commands/skill/setup.js';
import { Initializer } from '../../../../src/core/Initializer.js';
import { ProjectScanner } from '../../../../src/core/ProjectScanner.js';
import { Bundler } from '../../../../src/core/Bundler.js';
import * as Pipeline from '../../../../src/core/Pipeline.js';
import * as Symlinker from '../../../../src/core/Symlinker.js';
import * as configMod from '../../../../src/config.js';
import * as fs from 'node:fs';
import { CLI } from '@nexical/cli-core';
import { logger } from '../../../../src/core/Logger.js';

vi.mock('../../../../src/core/Initializer.js');
vi.mock('../../../../src/core/ProjectScanner.js');
vi.mock('../../../../src/core/Bundler.js');
vi.mock('../../../../src/core/Pipeline.js');
vi.mock('../../../../src/core/Symlinker.js');
vi.mock('../../../../src/config.js');
vi.mock('node:fs');

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('SetupCommand', () => {
  let command: SetupCommand;

  const mockConfig = {
    outputs: { contextFiles: [] },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    command = new SetupCommand(mockCli);
    // @ts-expect-error - overriding protected properties
    command.projectRoot = '/mock/root';
    // @ts-expect-error - overriding protected properties
    command.globalOptions = { debug: false };

    // @ts-expect-error - Mocking protected method
    command.config = { reskill: mockConfig };

    vi.mocked(configMod.getReskillConfig).mockReturnValue(
      mockConfig as unknown as configMod.ReskillConfig,
    );

    // Silence logger
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'success').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});

    // Default mock implementations
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.rmSync).mockImplementation(() => {});

    const mockScanner = { scan: vi.fn().mockResolvedValue([]) };
    vi.mocked(ProjectScanner).mockImplementation(function () {
      return mockScanner as unknown as ProjectScanner;
    });

    const mockBundler = {
      bundle: vi.fn().mockResolvedValue(undefined),
      getBundleDir: vi.fn().mockReturnValue('/mock/bundle'),
    };
    vi.mocked(Bundler).mockImplementation(function () {
      return mockBundler as unknown as Bundler;
    });
  });

  it('should run the full setup and integration lifecycle', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await command.run();

    expect(Initializer.initialize).toHaveBeenCalledWith(expect.anything(), '/mock/root');
    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('.reskill/skills'),
      expect.any(Object),
    );
    expect(ProjectScanner).toHaveBeenCalled();
    expect(Bundler).toHaveBeenCalled();
    expect(Symlinker.ensureSymlinks).toHaveBeenCalledWith(
      expect.anything(),
      '/mock/root',
      '/mock/bundle',
    );
    expect(Pipeline.updateContextFiles).toHaveBeenCalledWith(expect.anything(), '/mock/root');
  });

  it('should scope setup to a specific directory if provided', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/mock/root/test-scope');

    await command.run({ directory: 'test-scope' });

    const mockScannerInstance = vi.mocked(ProjectScanner).mock.results[0].value;
    expect(mockScannerInstance.scan).toHaveBeenCalledWith();
  });

  it('should abort if scoped directory does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await command.run({ directory: 'invalid-scope' });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Scoped directory does not exist'),
    );
    expect(Initializer.initialize).not.toHaveBeenCalled();
  });
});
