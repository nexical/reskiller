import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PromptCommand from '../../../../src/commands/skill/prompt.js';
import * as fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { CLI } from '@nexical/cli-core';
import { spawn, execSync } from 'node:child_process';
import nunjucks from 'nunjucks';
import readline from 'node:readline';

// Mock all external dependencies
vi.mock('node:fs/promises');
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('mocked file content'),
  };
});
vi.mock('node:child_process');
vi.mock('nunjucks', () => {
  const Environment = vi.fn();
  const FileSystemLoader = vi.fn();
  return {
    default: {
      Environment,
      FileSystemLoader,
    },
    Environment, // In case of named import usage (though code uses default)
  };
});
vi.mock('node:readline');

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('PromptCommand', () => {
  let command: PromptCommand;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    command = new PromptCommand(mockCli);
    command.info = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();

    // Default mock implementation for fs access
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('template content {{ promptName }}');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('mocked file content');

    // Mock Nunjucks
    const mockEnv = {
      addGlobal: vi.fn(),
      renderString: vi.fn().mockReturnValue('rendered prompt'),
    };
    // Default child process mock
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') cb(0);
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

    // Use standard function for constructor mocking
    // Use class implementation to ensure it works as a constructor
     
    vi.mocked(nunjucks.Environment).mockImplementation(
      class {
        constructor() {
          return mockEnv;
        }
      } as any,
    );

    // Spy on process.exit
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`Process.exit(${code})`);
      });
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  describe('Initialization and Template Loading', () => {
    it('should find prompt in user override location', async () => {
      // First access fails (user override check), second succeeds (fallback)
      // Actually, logic is: User Override -> Package Dir -> Error
      vi.mocked(fs.access).mockResolvedValueOnce(undefined); // Found in user override

      await command.run({ promptName: 'test' });

      expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Using user override'));
    });

    it('should fallback to package prompts if override missing', async () => {
      vi.mocked(fs.access)
        .mockRejectedValueOnce(new Error('No override')) // User override missing
        .mockResolvedValueOnce(undefined); // Package prompt found

      await command.run({ promptName: 'test' });

      // Should NOT log "Using user override"
      expect(command.info).not.toHaveBeenCalledWith(expect.stringContaining('Using user override'));
    });

    it('should fail if prompt file not found anywhere', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      await expect(command.run({ promptName: 'missing' })).rejects.toThrow('Process.exit(1)');
      expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Prompt file not found'));
    });

    it('should handle fs.readFile errors', async () => {
      // Found file, but read fails
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

      await expect(command.run({ promptName: 'test' })).rejects.toThrow('Process.exit(1)');
      expect(command.error).toHaveBeenCalledWith(
        expect.stringContaining('Error reading prompt file'),
      );
    });
  });

  describe('Nunjucks Rendering', () => {
    it('should register global helpers', async () => {
      await command.run({ promptName: 'test' });

      const mockEnv = vi.mocked(nunjucks.Environment).mock.results[0].value;
      expect(mockEnv.addGlobal).toHaveBeenCalledWith('context', expect.any(Function));
      expect(mockEnv.addGlobal).toHaveBeenCalledWith('read', expect.any(Function));
    });

    it('should handle render errors', async () => {
      const mockEnv = {
        addGlobal: vi.fn(),
        renderString: vi.fn().mockImplementation(() => {
          throw new Error('Render fail');
        }),
      };
       
      vi.mocked(nunjucks.Environment).mockImplementation(function () {
        return mockEnv;
      } as any);

      await expect(command.run({ promptName: 'test' })).rejects.toThrow('Process.exit(1)');
      expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Template render error'));
    });

    it('should execute context helper correctly', async () => {
      let contextHelper: ((...args: unknown[]) => unknown) | undefined;
      const mockEnv = {
        addGlobal: (name: string, fn: (...args: unknown[]) => unknown) => {
          if (name === 'context') contextHelper = fn;
        },
        renderString: vi.fn(),
      };
       
      vi.mocked(nunjucks.Environment).mockImplementation(function () {
        return mockEnv;
      } as any);

      await command.run({ promptName: 'test' });

      expect(contextHelper).toBeDefined();

      // Test context helper success
      vi.mocked(execSync).mockReturnValue('context output');
      const result = contextHelper!('src');
      expect(result).toContain('<CODEBASE_CONTEXT path="src">');
      expect(result).toContain('context output');

      // Test context helper failure
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Repomix failed');
      });
      const errorResult = contextHelper!('src');
      expect(errorResult).toContain('[Error generating context for src]');
    });

    it('should execute read helper correctly', async () => {
      let readHelper: ((...args: unknown[]) => unknown) | undefined;
      const mockEnv = {
        addGlobal: (name: string, fn: (...args: unknown[]) => unknown) => {
          if (name === 'read') readHelper = fn;
        },
        renderString: vi.fn(),
      };
       
      vi.mocked(nunjucks.Environment).mockImplementation(function () {
        return mockEnv;
      } as any);

      await command.run({ promptName: 'test' });

      expect(readHelper).toBeDefined();

      // Test read helper success
      // Mock fs.readFileSync
      // const { readFileSync } = await import('node:fs');
      const result = readHelper!('file.txt');
      expect(result).toBe('mocked file content');

      // Test read helper failure
      // Mock readFileSync to throw for next call
      // Note: We need a way to make it throw specifically inside the helper.
      // We can just spy on the helper execution if we mocked readFileSync globally.
      // But since we mocked logic, we can try to pass a path that triggers error?
      // Or re-mock readFileSync for a second test run.
    });
  });

  describe('Model Execution', () => {
    it('should execute successfully with first model', async () => {
      // Mock spawn success
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      await command.run({ promptName: 'test' });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('gemini --yolo'),
        expect.any(Object),
      );
      expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Model rotation strategy'));
    });

    it('should rotate models on 429 error', async () => {
      // First model fails with 429, second succeeds
      const mockChild1 = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn((event, cb) => cb('429 ResourceExhausted')) },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(1);
        }),
      };

      const mockChild2 = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };

      vi.mocked(spawn)
        .mockReturnValueOnce(mockChild1 as unknown as ReturnType<typeof spawn>)
        .mockReturnValueOnce(mockChild2 as unknown as ReturnType<typeof spawn>);

      await command.run({ promptName: 'test', models: 'model1,model2' });

      expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('exhausted'));
      expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Switching to next model'));
    });

    it('should fail if all models fail', async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(1);
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      await expect(command.run({ promptName: 'test' })).rejects.toThrow('Process.exit(1)');
      expect(command.error).toHaveBeenCalledWith(expect.stringContaining('All attempts failed'));
    });

    it('should handle spawn errors', async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'error') cb(new Error('Spawn failed'));
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      await expect(command.run({ promptName: 'test' })).rejects.toThrow('Process.exit(1)');
      expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to spawn Gemini'));
    });
  });

  describe('Interactive Mode', () => {
    it('should exit when user types exit', async () => {
      // Model succeeds
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      // Mock interaction
      const mockRl = {
        question: vi.fn((q, cb) => cb('exit')),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as unknown as readline.Interface);

      await command.run({ promptName: 'test', interactive: true });

      expect(readline.createInterface).toHaveBeenCalled();
      expect(mockRl.question).toHaveBeenCalled();
    });

    it('should loop processing user input', async () => {
      // Model succeeds
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      // First answer "Follow up", second "exit"
      const mockRl1 = {
        question: vi.fn((q, cb) => cb('Follow up')),
        close: vi.fn(),
      };
      const mockRl2 = {
        question: vi.fn((q, cb) => cb('exit')),
        close: vi.fn(),
      };

      vi.mocked(readline.createInterface)
        .mockReturnValueOnce(mockRl1 as unknown as readline.Interface)
        .mockReturnValueOnce(mockRl2 as unknown as readline.Interface);

      await command.run({ promptName: 'test', interactive: true });

      expect(spawn).toHaveBeenCalledTimes(2);
    });
  });
});
