import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestProject } from '../../setup.js';
import { CLI } from '@nexical/cli-core';

describe('WatchCommand Integration', () => {
  let projectDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let WatchCommand: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let command: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();

    projectDir = createTestProject('watch-test');

    // Mock Chokidar
    const mockWatcher = {
      on: vi.fn(),
      close: vi.fn(),
    };
    vi.doMock('chokidar', () => {
      return {
        default: {
          watch: vi.fn().mockReturnValue(mockWatcher),
        },
        watch: vi.fn().mockReturnValue(mockWatcher),
      };
    });

    // Mock Utils
    vi.doMock('../../../../src/core/ProjectScanner.js', () => ({
      ProjectScanner: class {
        constructor() {}
        async scan() {
          return [];
        }
      },
    }));

    vi.doMock('../../../../src/core/Initializer.js', () => ({
      Initializer: { initialize: vi.fn() },
    }));

    // Import Command
    const mod = await import('../../../../src/commands/skill/watch.js');
    WatchCommand = mod.default;

    const mockCli = {} as unknown as CLI;
    command = new WatchCommand(mockCli);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (command as any).config = {
      reskill: {
        discovery: { root: '.', markers: ['.skills'], ignore: [], depth: 5 },
        outputs: { contextFiles: [], symlinks: [] },
        constitution: { architecture: 'Test', patterns: 'Test Patterns' },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (command as any).projectRoot = projectDir;

    command.info = vi.fn();
    command.error = vi.fn();
    command.success = vi.fn();
    command.warn = vi.fn();
  });

  it('should start watcher', async () => {
    await command.run();

    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Starting Watcher'));
  });
});
