import { describe, it, expect, vi, beforeEach } from 'vitest';
import WatchCommand from '../../../../src/commands/skill/watch.js';
import * as configMod from '../../../../src/config.js';
import chokidar from 'chokidar';
import { CLI } from '@nexical/cli-core';

vi.mock('../../../../src/config.js');
vi.mock('chokidar');

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('WatchCommand', () => {
  let command: WatchCommand;
  const mockConfig = {
    input: {
      platformDirs: [{ path: 'core' }],
      moduleDirs: ['modules/*'],
    },
    licenseKey: 'valid-key',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    command = new WatchCommand(mockCli);
    command.info = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();

    vi.mocked(configMod.loadConfig).mockReturnValue(
      mockConfig as unknown as configMod.ReskillConfig,
    );
  });

  it('should start watcher if license is valid', async () => {
    const onMock = vi.fn();
    vi.mocked(chokidar.watch).mockReturnValue({ on: onMock } as unknown as chokidar.FSWatcher);

    await command.run();

    expect(chokidar.watch).toHaveBeenCalledWith(
      expect.arrayContaining(['core', 'modules/*']),
      expect.any(Object),
    );
    expect(onMock).toHaveBeenCalledWith('change', expect.any(Function));
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Starting Watcher'));
  });

  it('should exit if license missing', async () => {
    vi.mocked(configMod.loadConfig).mockReturnValue({
      ...mockConfig,
      licenseKey: undefined,
    } as unknown as configMod.ReskillConfig);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Exit called');
    });

    await expect(command.run()).rejects.toThrow('Exit called');

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Pro feature'));
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should exit if license expired', async () => {
    vi.mocked(configMod.loadConfig).mockReturnValue({
      ...mockConfig,
      licenseKey: 'expired',
    } as unknown as configMod.ReskillConfig);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Exit called');
    });

    await expect(command.run()).rejects.toThrow('Exit called');

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('License expired'));
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should exit if config missing', async () => {
    vi.mocked(configMod.loadConfig).mockImplementation(() => {
      throw new Error('Missing');
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Exit called');
    });

    await expect(command.run()).rejects.toThrow('Exit called');

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing reskill.config.json'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should handle file change event', async () => {
    const onMock = vi.fn().mockImplementation((event, cb) => {
      if (event === 'change') {
        cb('changed/file.ts');
      }
    });
    vi.mocked(chokidar.watch).mockReturnValue({ on: onMock } as unknown as chokidar.FSWatcher);

    await command.run();

    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('File changed'));
  });

  it('should have hooks stubs', async () => {
    const { hooks } = await import('../../../../src/commands/skill/watch.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(hooks.onDriftDetected({} as unknown as any, 'file')).resolves.toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(hooks.onSkillUpdated({} as unknown as any)).resolves.toBeUndefined();
  });
});
