import { describe, it, expect, vi, beforeEach } from 'vitest';
import InitCommand from '../../../../src/commands/skill/init.js';
import { CLI } from '@nexical/cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { logger } from '../../../../src/core/Logger.js';

vi.mock('node:fs');
vi.mock('../../../../src/core/Logger.js', () => ({
  logger: {
    setCommand: vi.fn(),
    setDebug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('yaml', async () => {
  const actual = await vi.importActual<typeof yaml>('yaml');
  return {
    ...actual,
    parseDocument: vi.fn(),
    parse: vi.fn(),
    stringify: vi.fn(),
  };
});

// Mock CLI
const mockCli = {
  getRawCLI: vi.fn().mockReturnValue({
    outputHelp: vi.fn(),
  }),
} as unknown as CLI;

describe('InitCommand', () => {
  let command: InitCommand;
  const projectRoot = '/test/root';

  beforeEach(() => {
    vi.resetAllMocks();
    command = new InitCommand(mockCli);
    // @ts-expect-error - overriding protected property
    command.projectRoot = projectRoot;
    // @ts-expect-error - overriding protected property
    command.globalOptions = { debug: false };
    // @ts-expect-error - overriding protected property
    command.config = {};

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as unknown as string);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined as unknown as void);
    vi.mocked(fs.readFileSync).mockReturnValue('');

    vi.mocked(yaml.parse).mockImplementation((str) => ({
      reskill: str.includes('reskill') ? {} : undefined,
    }));
    vi.mocked(yaml.stringify).mockImplementation((obj) => JSON.stringify(obj));
    // @ts-expect-error - mock implementation is incomplete
    vi.mocked(yaml.parseDocument).mockImplementation((str: string) => {
      return {
        has: vi.fn().mockReturnValue(str.includes('reskill')),
        set: vi.fn(),
        toString: vi.fn().mockReturnValue('mocked-yaml'),
      } as unknown as yaml.Document;
    });
  });

  describe('Scoped directory', () => {
    it('should create directory if it does not exist', async () => {
      const directory = 'new-project';
      const scopeDir = path.resolve(projectRoot, directory);

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p === scopeDir) return false;
        return false;
      });

      await command.run({ directory });

      expect(fs.mkdirSync).toHaveBeenCalledWith(scopeDir, { recursive: true });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Creating directory ${directory}`),
      );
    });

    it('should skip if reskiller.yaml already exists in scope', async () => {
      const directory = 'existing-project';
      const scopeDir = path.resolve(projectRoot, directory);
      const reskillerYamlPath = path.join(scopeDir, 'reskiller.yaml');

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p === scopeDir) return true;
        if (p === reskillerYamlPath) return true;
        return false;
      });

      await command.run({ directory });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Reskill configuration already exists'),
      );
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should create reskiller.yaml in scope if it does not exist', async () => {
      const directory = 'new-project';
      const scopeDir = path.resolve(projectRoot, directory);
      const reskillerYamlPath = path.join(scopeDir, 'reskiller.yaml');

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p === scopeDir) return true;
        if (p === reskillerYamlPath) return false;
        return false;
      });

      await command.run({ directory });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        reskillerYamlPath,
        expect.stringContaining('architecture":".reskill/architecture.md"'),
      );
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining(`Created ${path.relative(projectRoot, reskillerYamlPath)}`),
      );
    });
  });

  describe('No scope', () => {
    it('should skip if nexical.yaml already has reskill key', async () => {
      const nexicalYamlPath = path.join(projectRoot, 'nexical.yaml');
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p === nexicalYamlPath) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('reskill: {}');

      await command.run();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Reskill configuration already exists in nexical.yaml'),
      );
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should add reskill key to nexical.yaml if missing', async () => {
      const nexicalYamlPath = path.join(projectRoot, 'nexical.yaml');
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p === nexicalYamlPath) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('name: test-project');
      // @ts-expect-error - mock return type mismatch
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'auth', isDirectory: () => true },
        { name: 'db', isDirectory: () => true },
      ] as unknown as fs.Dirent[]);

      await command.run();

      expect(fs.writeFileSync).toHaveBeenCalledWith(nexicalYamlPath, 'mocked-yaml');
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining('Added reskill configuration to nexical.yaml'),
      );
    });

    it('should fallback to yaml.parse and add reskill key if yaml.parseDocument fails', async () => {
      const nexicalYamlPath = path.join(projectRoot, 'nexical.yaml');
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p === nexicalYamlPath) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('name: test-project');

      vi.mocked(yaml.parseDocument).mockImplementation(() => {
        throw new Error('Parse error');
      });
      vi.mocked(yaml.parse).mockReturnValue({ name: 'test-project' });

      await command.run();

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining('Added reskill configuration to nexical.yaml'),
      );
    });

    it('should skip if nexical.yaml fails to parse but already has reskill key', async () => {
      const nexicalYamlPath = path.join(projectRoot, 'nexical.yaml');
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p === nexicalYamlPath) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('reskill:\n  some: data');

      vi.mocked(yaml.parseDocument).mockImplementation(() => {
        throw new Error('Parse error');
      });
      vi.mocked(yaml.parse).mockReturnValue({ reskill: { some: 'data' } });

      await command.run();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Reskill configuration already exists in nexical.yaml'),
      );
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should skip if reskiller.yaml already exists (no nexical.yaml)', async () => {
      const reskillerYamlPath = path.join(projectRoot, 'reskiller.yaml');
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p === reskillerYamlPath) return true;
        return false;
      });

      await command.run();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Reskill configuration already exists at reskiller.yaml'),
      );
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should create reskiller.yaml if nothing exists', async () => {
      const reskillerYamlPath = path.join(projectRoot, 'reskiller.yaml');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await command.run();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        reskillerYamlPath,
        expect.stringContaining('constitution'),
      );
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining('Created reskiller.yaml'),
      );
    });

    it('should use process.cwd() if projectRoot is not set', async () => {
      // @ts-expect-error - overriding protected property
      command.projectRoot = undefined;
      const cwd = process.cwd();
      const reskillerYamlPath = path.join(cwd, 'reskiller.yaml');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await command.run();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        reskillerYamlPath,
        expect.stringContaining('constitution'),
      );
    });

    it('should handle empty yaml parsing in fallback', async () => {
      const nexicalYamlPath = path.join(projectRoot, 'nexical.yaml');
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p === nexicalYamlPath) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('');

      vi.mocked(yaml.parseDocument).mockImplementation(() => {
        throw new Error('Parse error');
      });
      vi.mocked(yaml.parse).mockReturnValue(null);

      await command.run();

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining('Added reskill configuration to nexical.yaml'),
      );
    });
  });
});
