import { describe, it, expect, vi, beforeEach } from 'vitest';
import WatchCommand from '../../../../src/commands/skill/watch.js';
import * as configMod from '../../../../src/config.js';
import chokidar from 'chokidar';
import { ProjectScanner } from '../../../../src/core/ProjectScanner.js';
import { CLI } from '@nexical/cli-core';
import { logger } from '../../../../src/core/Logger.js';

vi.mock('../../../../src/config.js');
vi.mock('chokidar');
vi.mock('../../../../src/core/ProjectScanner.js');

// Mock Initializer dynamic import
vi.mock('../../../../src/core/Initializer.js', () => ({
  Initializer: {
    initialize: vi.fn(),
  },
}));

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('WatchCommand', () => {
  let command: WatchCommand;
  const mockConfig = {
    constitution: { architecture: 'Test' },
    outputs: { contextFiles: [] },
    licenseKey: 'valid',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    command = new WatchCommand(mockCli);
    command.info = vi.fn();
    command.error = vi.fn().mockImplementation(() => {
      throw new Error('Exit called');
    });
    command.warn = vi.fn();

    logger.setCommand(command);

    // Inject config
    // @ts-expect-error - Mocking protected method
    command.config = { reskill: mockConfig };

    vi.mocked(configMod.getReskillConfig).mockReturnValue(
      mockConfig as unknown as configMod.ReskillConfig,
    );

    vi.mocked(ProjectScanner).mockImplementation(function () {
      return {
        scan: vi.fn().mockResolvedValue([
          { name: 'core', path: 'core' },
          { name: 'mod1', path: 'modules/mod1' },
        ]),
      } as unknown as ProjectScanner;
    });
  });

  it('should start watcher if license is valid', async () => {
    const onMock = vi.fn();
    vi.mocked(chokidar.watch).mockReturnValue({ on: onMock } as unknown as chokidar.FSWatcher);

    await command.run();

    expect(chokidar.watch).toHaveBeenCalledWith(
      expect.arrayContaining(['core', 'modules/mod1']),
      expect.any(Object),
    );
    expect(onMock).toHaveBeenCalledWith('change', expect.any(Function));
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Starting Watcher'));
  });

  it('should exit if license missing', async () => {
    vi.mocked(configMod.getReskillConfig).mockReturnValue({
      ...mockConfig,
      licenseKey: undefined,
    } as unknown as configMod.ReskillConfig);
    await expect(command.run()).rejects.toThrow('Exit called');

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Pro feature'));
  });

  it('should exit if license expired', async () => {
    vi.mocked(configMod.getReskillConfig).mockReturnValue({
      ...mockConfig,
      licenseKey: 'expired',
    } as unknown as configMod.ReskillConfig);
    await expect(command.run()).rejects.toThrow('Exit called');

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('License expired'));
  });

  it('should exit if config missing', async () => {
    vi.mocked(configMod.getReskillConfig).mockImplementation(() => {
      throw new Error('Missing');
    });

    await expect(command.run()).rejects.toThrow('Exit called');

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Missing'));
  });

  it('should exit if config throws non-error', async () => {
    vi.mocked(configMod.getReskillConfig).mockImplementation(() => {
      throw 'String Error';
    });

    await expect(command.run()).rejects.toThrow('Exit called');

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('String Error'));
  });

  it('should handle file change event', async () => {
    // We need to capture the callback passed to 'on'
    let changeCallback: ((filePath: string) => Promise<void>) | undefined;

    vi.mocked(chokidar.watch).mockReturnValue({
      on: vi.fn((event, cb) => {
        if (event === 'change') {
          changeCallback = cb;
        }
        return {} as unknown as chokidar.FSWatcher;
      }),
    } as unknown as chokidar.FSWatcher);

    await command.run();

    expect(changeCallback).toBeDefined();
    if (changeCallback) {
      await changeCallback('changed/file.ts');
      expect(command.info).toHaveBeenCalledWith(expect.stringContaining('File changed'));
      expect(command.warn).toHaveBeenCalledWith(
        expect.stringContaining('Incremental update not fully implemented'),
      );
    }
  });

  it('should have hooks stubs', async () => {
    const { hooks } = await import('../../../../src/commands/skill/watch.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(hooks.onDriftDetected({} as unknown as any, 'file')).resolves.toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(hooks.onSkillUpdated({} as unknown as any)).resolves.toBeUndefined();
  });
});
