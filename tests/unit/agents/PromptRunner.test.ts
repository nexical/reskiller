import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptRunner } from '../../../src/agents/PromptRunner.js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { AiClientFactory } from '@nexical/ai';
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
vi.mock('@nexical/ai');
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
    mockEnv.renderString.mockImplementation((tmpl, ctx, cb) => {
      if (cb) cb(null, 'Hello World');
      return 'Hello World';
    });

    // 3. Mock AiClientFactory
    const mockRun = vi.fn().mockResolvedValue({
      code: 0,
      shouldRetry: false,
      output: 'mocked output',
    });
    vi.mocked(AiClientFactory.create).mockReturnValue({
      run: mockRun,
    } as unknown as ReturnType<typeof AiClientFactory.create>);

    await PromptRunner.run({
      promptName: 'test-prompt',
      name: 'World',
    });

    expect(fs.access).toHaveBeenCalled();
    expect(mockEnv.renderString).toHaveBeenCalledWith(
      'Hello {{ name }}',
      expect.objectContaining({ name: 'World' }),
    );
    expect(AiClientFactory.create).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith('gemini-3-pro-preview', expect.any(String));
  });

  it('should fail if gemini fails after model rotation', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('template');

    mockEnv.renderString.mockImplementation((tmpl, ctx, cb) => {
      if (cb) cb(null, 'rendered');
      return 'rendered';
    });

    // Mock first call as 429 error, second call as fatal error
    let callCount = 0;
    const mockRun = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { code: 1, shouldRetry: true, output: '' };
      }
      return { code: 1, shouldRetry: false, output: '' };
    });

    vi.mocked(AiClientFactory.create).mockReturnValue({
      run: mockRun,
    } as unknown as ReturnType<typeof AiClientFactory.create>);

    await expect(
      PromptRunner.run({
        promptName: 'test-prompt',
        models: 'model1,model2',
      }),
    ).rejects.toThrow('Prompt execution failed with code 1');

    expect(mockRun).toHaveBeenCalledTimes(2); // Attempted both models
  });

  it('should support interactive mode', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('interactive template');

    mockEnv.renderString.mockImplementation((tmpl, ctx, cb) => {
      if (cb) cb(null, 'rendered');
      return 'rendered';
    });

    // Success on first call
    const mockRun = vi.fn().mockResolvedValue({
      code: 0,
      shouldRetry: false,
      output: 'mocked output',
    });
    vi.mocked(AiClientFactory.create).mockReturnValue({
      run: mockRun,
    } as unknown as ReturnType<typeof AiClientFactory.create>);

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
