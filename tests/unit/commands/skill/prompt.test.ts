import { describe, it, expect, vi, beforeEach } from 'vitest';
import PromptCommand from '../../../../src/commands/skill/prompt.js';
import * as fs from 'node:fs/promises';
import { CLI } from '@nexical/cli-core';

vi.mock('node:fs/promises');
vi.mock('node:fs');
vi.mock('node:child_process');

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('PromptCommand', () => {
  let command: PromptCommand;

  beforeEach(() => {
    vi.resetAllMocks();
    command = new PromptCommand(mockCli);
    command.info = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();

    // Default mock implementation for fs access
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('template content');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
  });

  it('should run prompt command', async () => {
    // Mock private runGemini method key if difficult to test via public API without child_process complexity
    // But better to mock child_process.spawn.
    // For simplicity in this refactor, let's just ensure it calls basic steps.

    // We will mock process.exit to avoid exiting test runner
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Exit');
    });

    // Mock Gemini execution to return success immediately
    const { spawn } = await import('node:child_process');
    vi.mocked(spawn).mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') cb(0);
      }),
    } as unknown as import('node:child_process').ChildProcess);

    await command.run({ promptName: 'test', models: 'model1' });

    expect(fs.readFile).toHaveBeenCalled();
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Rendering template'));

    exitSpy.mockRestore();
  });

  it('should fail if prompt file not found in any location', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Exit');
    });

    await expect(command.run({ promptName: 'missing' })).rejects.toThrow('Exit');

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Prompt file not found'));
    exitSpy.mockRestore();
  });
});
