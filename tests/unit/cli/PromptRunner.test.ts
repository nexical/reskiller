import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptRunner } from '../../../src/cli/PromptRunner.js';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

vi.mock('node:fs/promises');
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  };
});
vi.mock('node:child_process');
vi.mock('node:readline');
vi.mock('minimist', () => ({
  default: (args: string[]) => {
    const parsed: { _: string[] } & Record<string, string | boolean | string[]> = { _: [] };
    args.forEach((arg) => {
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        parsed[key] = value || true;
      } else if (arg.startsWith('-')) {
        parsed[arg.slice(1)] = true;
      } else {
        parsed._.push(arg);
      }
    });
    return parsed;
  },
}));

describe('PromptRunner', () => {
  let mockLog: ReturnType<typeof vi.fn<(msg: string, ...args: unknown[]) => void>>;
  let mockError: ReturnType<typeof vi.fn<(msg: string, ...args: unknown[]) => void>>;
  let mockWarn: ReturnType<typeof vi.fn<(msg: string, ...args: unknown[]) => void>>;
  let runner: PromptRunner;

  beforeEach(() => {
    vi.resetAllMocks();
    mockLog = vi.fn();
    mockError = vi.fn();
    mockWarn = vi.fn();
    runner = new PromptRunner({ log: mockLog, error: mockError, warn: mockWarn });

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('Template content {{ target }}');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
  });

  it('should show help if no prompt name provided', async () => {
    const code = await runner.run([]);
    expect(code).toBe(0);
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });

  it('should run gemini with prompt file', async () => {
    // Mock spawn
    const mockStdout = { on: vi.fn() };
    const mockStderr = { on: vi.fn() };
    const mockStdin = { write: vi.fn(), end: vi.fn() };
    const mockChild = {
      stdout: mockStdout,
      stderr: mockStderr,
      stdin: mockStdin,
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') cb(0);
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as any);

    const code = await runner.run(['auditor', '--target=file.ts']);

    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('gemini --yolo'),
      expect.any(Object),
    );
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Attempting with model'));
  });

  it('should handle prompt file not found', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

    const code = await runner.run(['missing']);

    expect(code).toBe(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Prompt file not found'));
  });

  it('should retry on 429', async () => {
    const mockChild = (exitCode: number, stderr = '') => {
      return {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn().mockImplementation((event, cb) => {
            if (event === 'data' && stderr) cb(stderr);
          }),
        },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'close') cb(exitCode);
        }),
      };
    };

    vi.mocked(spawn).mockImplementation(() => {
      return mockChild(0) as unknown as any;
    });

    await runner.run(['audi']);

    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('exhausted'));
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Switching to next model'));
  });

  it('should handle interactive mode', async () => {
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') cb(0);
      }),
    };
    (spawn as any).mockReturnValue(mockChild);

    // Mock readline
    const mockRl = {
      question: vi.fn().mockImplementation((q, cb) => cb('exit')),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

    await runner.run(['chat', '--interactive']);

    expect(mockRl.question).toHaveBeenCalled();
  });

  it('should handle all attempts failing', async () => {
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') cb(1);
      }),
    };
    (spawn as any).mockReturnValue(mockChild);

    const code = await runner.run(['fail']);

    expect(code).toBe(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('All attempts failed'));
  });

  it('should loop in interactive mode', async () => {
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') cb(0);
      }),
    };
    (spawn as any).mockReturnValue(mockChild);

    let callCount = 0;
    const mockRl = {
      question: vi.fn().mockImplementation((q, cb) => {
        callCount++;
        if (callCount === 1) cb('continue');
        else cb('exit');
      }),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

    await runner.run(['chat', '--interactive']);

    expect(mockRl.question).toHaveBeenCalledTimes(2);
  });

  it('should handle stdout and stderr from child process', async () => {
    const mockChild = {
      stdout: {
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'data') cb(Buffer.from('stdout output'));
        }),
      },
      stderr: {
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'data') cb(Buffer.from('stderr output'));
        }),
      },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') cb(0);
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as any);

    const code = await runner.run(['test']);
    expect(code).toBe(0);
  });

  it('should handle child process error', async () => {
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'error') cb(new Error('Spawn failed'));
        if (event === 'close') cb(1);
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as any);

    const code = await runner.run(['test']);
    expect(code).toBe(1);
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to spawn'),
      expect.anything(),
    );
  });

  it('should handle file read error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('Read failed'));

    const code = await runner.run(['prompt']);

    expect(code).toBe(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Error reading prompt file'));
  });

  it('should use read helper in template', async () => {
    (fs.readFile as any).mockResolvedValue('Content: {{ read("file.txt") }}');

    // Mock readFileSync for helper
    const { readFileSync } = await import('node:fs');
    vi.mocked(readFileSync).mockReturnValue('FILE_CONTENT');

    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') cb(0);
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as any);

    await runner.run(['prompt']);

    // Check if template was rendered with file content
    expect(spawn).toHaveBeenCalledWith(expect.stringContaining('model'), expect.anything());
  });

  it('should use context helper in template', async () => {
    (fs.readFile as any).mockResolvedValue('Context: {{ context("src") }}');

    // Mock execSync for context helper
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockReturnValue('<xml>Repo Content</xml>');

    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'close') cb(0);
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as any);

    await runner.run(['prompt']);

    expect(execSync).toHaveBeenCalledWith(expect.stringContaining('repomix'), expect.anything());
  });
});
