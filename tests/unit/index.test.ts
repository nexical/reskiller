import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock commander to verify registration without executing
vi.mock('commander', () => {
  const mCommand: Record<string, ReturnType<typeof vi.fn>> = {};
  mCommand.name = vi.fn().mockReturnValue(mCommand);
  mCommand.description = vi.fn().mockReturnValue(mCommand);
  mCommand.version = vi.fn().mockReturnValue(mCommand);
  mCommand.command = vi.fn().mockReturnValue(mCommand);
  mCommand.action = vi.fn().mockReturnValue(mCommand);
  mCommand.parse = vi.fn().mockReturnValue(mCommand);

  return {
    Command: vi.fn(function () {
      return mCommand;
    }),
  };
});

import * as configMod from '../../src/config.js';
vi.mock('../../src/config.js');

describe('index (CLI entry point)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should register all commands', async () => {
    // dynamic import to trigger execution
    await import('../../src/index.js');

    const program = new (await import('commander')).Command();

    expect(program.command).toHaveBeenCalledWith('init');
    expect(program.command).toHaveBeenCalledWith('watch');
    expect(program.command).toHaveBeenCalledWith('evolve');
    expect(program.command).toHaveBeenCalledWith('refine <skillName> <modulePath>');
    expect(program.parse).toHaveBeenCalled();
  });

  it('should try to load config but not crash if missing', async () => {
    vi.mocked(configMod.loadConfig).mockImplementation(() => {
      throw new Error('Config missing');
    });

    await import('../../src/index.js'); // resetModules handles re-import
    // If no error thrown, it passed.
  });
});
