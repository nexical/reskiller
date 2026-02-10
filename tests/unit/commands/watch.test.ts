import { describe, it, expect, vi, beforeEach } from 'vitest';
import { watchCommand } from '../../../src/commands/watch.js';
import * as configMod from '../../../src/config.js';
import chokidar from 'chokidar';

vi.mock('../../../src/config.js');
vi.mock('chokidar');

describe('watchCommand', () => {
  const mockConfig = {
    input: {
      platformDirs: [{ path: 'core' }],
      moduleDirs: ['modules/*'],
    },
    licenseKey: 'valid-key',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(configMod.loadConfig).mockReturnValue(mockConfig as any);
  });

  it('should start watcher if license is valid', async () => {
    const onMock = vi.fn();
    vi.mocked(chokidar.watch).mockReturnValue({ on: onMock } as any);

    await watchCommand({});

    expect(chokidar.watch).toHaveBeenCalledWith(
      expect.arrayContaining(['core', 'modules/*']),
      expect.any(Object),
    );
    expect(onMock).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('should exit if license missing', async () => {
    vi.mocked(configMod.loadConfig).mockReturnValue({
      ...mockConfig,
      licenseKey: undefined,
    } as any);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Exit called');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(watchCommand({})).rejects.toThrow('Exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should exit if license expired', async () => {
    vi.mocked(configMod.loadConfig).mockReturnValue({
      ...mockConfig,
      licenseKey: 'expired',
    } as any);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Exit called');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(watchCommand({})).rejects.toThrow('Exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should exist if config missing', async () => {
    vi.mocked(configMod.loadConfig).mockImplementation(() => {
      throw new Error('Missing');
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Exit called');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(watchCommand({})).rejects.toThrow('Exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should handle file change event', async () => {
    const onMock = vi.fn().mockImplementation((event, cb) => {
      if (event === 'change') {
        cb('changed/file.ts');
      }
    });
    vi.mocked(chokidar.watch).mockReturnValue({ on: onMock } as any);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await watchCommand({});

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('File changed'));
    logSpy.mockRestore();
  });
  it('should have hooks stubs', async () => {
    const { hooks } = await import('../../../src/commands/watch.js');
    await expect(hooks.onDriftDetected({} as any, 'file')).resolves.toBeUndefined();
    await expect(hooks.onSkillUpdated({} as any)).resolves.toBeUndefined();
  });
});
