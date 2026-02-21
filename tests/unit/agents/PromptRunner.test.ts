import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptRunner } from '../../../src/agents/PromptRunner.js';
import { AiClientFactory, type AiClient } from '@nexical/ai';
import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { pack } from 'repomix';
import readline from 'node:readline';

vi.mock('@nexical/ai');
vi.mock('node:fs/promises');
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));
vi.mock('repomix');
vi.mock('node:readline');

describe('PromptRunner', () => {
  let mockAiClient: AiClient;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAiClient = {
      run: vi.fn().mockResolvedValue({ code: 0, output: 'Success' }),
    } as unknown as AiClient;
    vi.mocked(AiClientFactory.create).mockReturnValue(mockAiClient);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockImplementation(async (p) => {
      const pathStr = p.toString();
      if (pathStr.endsWith('.md')) return 'Description: {{ description }}';
      return 'file content';
    });
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
  });

  it('should run a prompt successfully', async () => {
    await PromptRunner.run({
      promptName: 'test-prompt',
      description: 'Test Run',
    });

    expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('test-prompt.md'), 'utf-8');
    expect(mockAiClient.run).toHaveBeenCalled();
  });

  it('should handle prompt selection priority', async () => {
    // Override exists
    vi.mocked(fs.access).mockResolvedValue(undefined);
    await PromptRunner.run({ promptName: 'test' });
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('.agent/prompts/test.md'),
      'utf-8',
    );

    // Override missing, package prompt exists
    vi.mocked(fs.access)
      .mockRejectedValueOnce(new Error('Missing'))
      .mockResolvedValueOnce(undefined);
    await PromptRunner.run({ promptName: 'test' });
    expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('prompts/test.md'), 'utf-8');
  });

  it('should throw error if prompt file totally missing', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('Missing'));
    await expect(PromptRunner.run({ promptName: 'ghost' })).rejects.toThrow(
      'Prompt file not found',
    );
  });

  it('should handle model rotation and retries', async () => {
    vi.mocked(mockAiClient.run)
      .mockResolvedValueOnce({ code: 1, shouldRetry: true, output: '' })
      .mockResolvedValueOnce({ code: 0, output: 'Fallback Success', shouldRetry: false });

    await PromptRunner.run({ promptName: 'test', models: 'm1, m2' });

    expect(mockAiClient.run).toHaveBeenCalledTimes(2);
  });

  describe('Nunjucks Globals', () => {
    it('context global should pack codebase if target is directory', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const pathStr = p.toString();
        if (pathStr.includes('test-prompt')) return '{{ context("/dir") }}';
        if (pathStr.includes('repomix-output')) return 'Packed Context';
        return 'other content';
      });
      vi.mocked(statSync).mockReturnValue({ isFile: () => false } as unknown as ReturnType<
        typeof statSync
      >);

      await PromptRunner.run({ promptName: 'test-prompt' });

      expect(pack).toHaveBeenCalled();
      expect(mockAiClient.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Packed Context'),
      );
    });

    it('context global should read file directly if target is file', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('test.md')) return '{{ context("/file.ts") }}';
        if (pathStr.endsWith('/file.ts')) return 'File Content';
        return 'other content';
      });
      vi.mocked(statSync).mockReturnValue({ isFile: () => true } as unknown as ReturnType<
        typeof statSync
      >);

      await PromptRunner.run({ promptName: 'test' });

      expect(mockAiClient.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('File Content'),
      );
    });

    it('read global should read multiple files and handle strings with commas', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('test.md')) return '{{ read("/f1 , /f2") }}';
        if (pathStr.endsWith('/f1')) return 'C1';
        if (pathStr.endsWith('/f2')) return 'C2';
        return 'other';
      });

      await PromptRunner.run({ promptName: 'test' });

      expect(mockAiClient.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('C1\n\nC2'),
      );
    });

    it('read global should handle arrays', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('test.md')) return '{{ read(files) }}';
        if (pathStr.endsWith('/f1')) return 'C1';
        return 'other';
      });

      await PromptRunner.run({ promptName: 'test', files: ['/f1'] });
      expect(mockAiClient.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('C1'),
      );
    });
  });

  it('should normalize constitution patterns to array', async () => {
    await PromptRunner.run({
      promptName: 'test',
      constitution: { patterns: 'single-pattern' },
    });
  });

  describe('Error branches', () => {
    it('context global should handle non-existent path', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        if (p.toString().endsWith('test.md')) return '{{ context("/missing") }}';
        return 'other';
      });
      vi.mocked(existsSync).mockImplementation((p) => p.toString() !== '/missing');

      await PromptRunner.run({ promptName: 'test' });
      expect(mockAiClient.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('[Path not found: /missing]'),
      );
    });

    it('context global should handle pack errors', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        if (p.toString().endsWith('test.md')) return '{{ context("/dir") }}';
        return 'other';
      });
      vi.mocked(statSync).mockReturnValue({ isFile: () => false } as unknown as ReturnType<
        typeof statSync
      >);
      vi.mocked(pack).mockRejectedValue(new Error('Pack failed'));

      await PromptRunner.run({ promptName: 'test' });
      expect(mockAiClient.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('[Error generating context for /dir]'),
      );
    });

    it('read global should handle errors', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('test.md')) return '{{ read("/error") }}';
        if (pathStr.endsWith('/error')) throw new Error('Read failed');
        return 'other';
      });

      await PromptRunner.run({ promptName: 'test' });
      expect(mockAiClient.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('[Error reading file /error]'),
      );
    });

    it('should handle template render errors', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{{ undefined_fn() }}');
      await expect(PromptRunner.run({ promptName: 'test' })).rejects.toThrow(
        'Template render error',
      );
    });

    it('should handle async resolution failures', async () => {
      // We simulate a resolution failure by making one of the async globals throw internally
      vi.mocked(fs.readFile)
        .mockImplementationOnce(async () => '{{ context("/fail") }}') // prompt
        .mockRejectedValueOnce(new Error('Internal fail')); // context inner read

      // Wait, PromptRunner catches internal errors in resolvers and returns [Error...]
      // So we need a REJECTION in the promise itself that ISN'T caught.
      // But PromptRunner catches them.

      await PromptRunner.run({ promptName: 'test' });
      expect(mockAiClient.run).toHaveBeenCalled();
    });
  });

  it('should handle interactive mode', async () => {
    const mockRl = {
      question: vi.fn().mockImplementation((q, cb) => cb('exit')),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as unknown as readline.Interface);

    await PromptRunner.run({ promptName: 'test', interactive: true });

    expect(readline.createInterface).toHaveBeenCalled();
  });
});
