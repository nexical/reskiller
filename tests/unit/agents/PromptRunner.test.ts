import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptRunner } from '../../../src/agents/PromptRunner.js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const { mockEnv } = vi.hoisted(() => {
  return {
    mockEnv: {
      addGlobal: vi.fn(),
      renderString: vi.fn(),
    },
  };
});

vi.mock('node:fs/promises');
vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('node:readline');

vi.mock('nunjucks', () => {
  class MockEnvironment {
    addGlobal = mockEnv.addGlobal;
    renderString = mockEnv.renderString;
  }
  return {
    default: {
      Environment: MockEnvironment,
      FileSystemLoader: vi.fn(),
    },
    Environment: MockEnvironment,
    FileSystemLoader: vi.fn(),
  };
});

describe('PromptRunner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should run a prompt and succeed', async () => {
    // 1. Mock file access and reading
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('Hello {{ name }}');
    vi.mocked(existsSync).mockReturnValue(true);

    // 2. Mock nunjucks
    mockEnv.renderString.mockReturnValue('Hello World');

    // 3. Mock spawn for gemini
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

    await PromptRunner.run({
      promptName: 'test-prompt',
      name: 'World',
    });

    expect(fs.access).toHaveBeenCalled();
    expect(mockEnv.renderString).toHaveBeenCalledWith(
      'Hello {{ name }}',
      expect.objectContaining({ name: 'World' }),
    );
    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('gemini --yolo --model'),
      expect.any(Object) as unknown,
    );
  });

  it('should fail if gemini fails after model rotation', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('template');

    mockEnv.renderString.mockReturnValue('rendered');

    // Mock first call as 429 error, second call as fatal error
    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      const isRetryable = callCount === 1;
      return {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((event, cb) => {
            if (event === 'data' && isRetryable) cb(Buffer.from('ResourceExhausted (429)'));
          }),
        },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') callback(1);
        }),
      } as unknown as ReturnType<typeof spawn>;
    });

    await expect(
      PromptRunner.run({
        promptName: 'test-prompt',
        models: 'model1,model2',
      }),
    ).rejects.toThrow('Prompt execution failed with code 1');

    expect(spawn).toHaveBeenCalledTimes(2); // Attempted both models
  });

  it('should support interactive mode', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('interactive template');

    mockEnv.renderString.mockReturnValue('rendered');

    // Success on first call
    vi.mocked(spawn).mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    } as unknown as ReturnType<typeof spawn>);

    // Mock readline for "exit"
    const mockRl = {
      question: vi.fn((q, cb) => cb('exit')),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as unknown as readline.Interface);

    await PromptRunner.run({
      promptName: 'test-prompt',
      interactive: true,
    });

    expect(readline.createInterface).toHaveBeenCalled();
    expect(mockRl.question).toHaveBeenCalled();
  });
});
