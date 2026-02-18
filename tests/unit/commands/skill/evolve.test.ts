import { describe, it, expect, vi, beforeEach } from 'vitest';
import EvolveCommand from '../../../../src/commands/skill/evolve.js';
import * as configMod from '../../../../src/config.js';
import { Explorer } from '../../../../src/core/Explorer.js';
import { Architect } from '../../../../src/core/Architect.js';
import { ProjectScanner } from '../../../../src/core/ProjectScanner.js';
import { Bundler } from '../../../../src/core/Bundler.js';
import * as Pipeline from '../../../../src/core/Pipeline.js';
import { CLI } from '@nexical/cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('../../../../src/config.js');
vi.mock('../../../../src/core/Explorer.js');
vi.mock('../../../../src/core/Architect.js');
vi.mock('../../../../src/core/ProjectScanner.js');
vi.mock('../../../../src/core/Bundler.js');
vi.mock('../../../../src/core/Hooks.js');
vi.mock('../../../../src/core/Pipeline.js', async () => {
  return await import('../../../../tests/unit/mocks/Pipeline.js');
});
vi.mock('node:fs');

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('EvolveCommand', () => {
  let command: EvolveCommand;
  const mockConfig = {
    discovery: { root: '.', markers: ['.skills'], ignore: [], depth: 1 },
    skillsDir: 'skills',
    constitution: { architecture: 'Test' },
    outputs: { contextFiles: [], symlinks: [] },
  } as configMod.ReskillConfig;

  beforeEach(() => {
    vi.resetAllMocks();
    command = new EvolveCommand(mockCli);
    // Mock BaseCommand logger methods
    command.info = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();
    command.success = vi.fn();

    // Inject config as if from CLI
    // @ts-expect-error - Mocking protected method
    command.config = { reskill: mockConfig };

    vi.mocked(configMod.getReskillConfig).mockReturnValue(mockConfig);

    // Default FS mocks
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

    // Class mocks
    vi.mocked(ProjectScanner).mockImplementation(function () {
      return {
        scan: vi.fn().mockResolvedValue([]),
      } as unknown as ProjectScanner;
    });

    vi.mocked(Bundler).mockImplementation(function () {
      return {
        bundle: vi.fn().mockResolvedValue(undefined),
        getBundleDir: vi.fn().mockReturnValue('.reskill/skills'),
      } as unknown as Bundler;
    });

    vi.mocked(Explorer).mockImplementation(function () {
      return {
        discover: vi.fn().mockResolvedValue('kg.json'),
      } as unknown as Explorer;
    });

    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({ plan: [] }),
      } as unknown as Architect;
    });
  });

  it('should handle config errors', async () => {
    vi.mocked(configMod.getReskillConfig).mockImplementation(() => {
      throw new Error('Config Error');
    });

    await command.run();
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Config Error'));
  });

  it('should handle non-error objects in config errors', async () => {
    vi.mocked(configMod.getReskillConfig).mockImplementation(() => {
      throw 'String Error';
    });

    await command.run();
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('String Error'));
  });

  it('should run the evolution pipeline', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'test-skill', exemplar_module: 'path' }],
        }),
      } as unknown as Architect;
    });

    await command.run();
    expect(Pipeline.ensureTmpDir).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('Context files updated'));
  });

  it('should create skill directory if missing', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'new-skill', exemplar_module: 'path' }],
        }),
      } as unknown as Architect;
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);

    await command.run();

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('new-skill'), {
      recursive: true,
    });
  });

  it('should skip items missing name or path', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            { type: 'create_skill', target_skill: undefined },
            { type: 'create_skill', target_skill: 's1', exemplar_module: undefined },
          ],
        }),
      } as unknown as Architect;
    });

    await command.run();
    expect(Pipeline.stageAuditor).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledTimes(2);
  });

  it('should handle distributed skills', async () => {
    // Mock project scan returning a project
    const mockProjects = [
      {
        name: 'proj1',
        path: '/root/proj1',
        skillDir: '/root/proj1/.skills',
      },
    ];
    vi.mocked(ProjectScanner).mockImplementation(function () {
      return {
        scan: vi.fn().mockResolvedValue(mockProjects),
      } as unknown as ProjectScanner;
    });

    // Mock fs to simulate distributed skill existence
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString() === '/root/proj1/.skills') return true;
      return false;
    });

    vi.mocked(fs.readdirSync).mockImplementation(((p: fs.PathLike) => {
      if (p.toString() === '/root/proj1/.skills') {
        return [
          {
            name: 'distributed-skill',
            isDirectory: () => true,
          } as unknown as fs.Dirent,
        ];
      }
      return [];
    }) as any);

    // Architect plans to update this distributed skill
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            { type: 'update_skill', target_skill: 'distributed-skill', exemplar_module: 'path' },
          ],
        }),
      } as unknown as Architect;
    });

    await command.run();

    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('Targeting distributed skill'),
    );
    // Verify it targets the distributed path, not global
    expect(fs.mkdirSync).not.toHaveBeenCalledWith(
      path.join('skills', 'distributed-skill'),
      expect.any(Object),
    );
  });

  it('should handle errors scanning distributed skills', async () => {
    const mockProjects = [
      {
        name: 'proj1',
        path: '/root/proj1',
        skillDir: '/root/proj1/.skills',
      },
    ];
    vi.mocked(ProjectScanner).mockImplementation(function () {
      return {
        scan: vi.fn().mockResolvedValue(mockProjects),
      } as unknown as ProjectScanner;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation((p) => {
      // Only throw for the specific distributed skill directory
      if (p.toString().includes('.skills') && !p.toString().includes('prompts')) {
        throw new Error('Read Error');
      }
      return [];
    });

    await command.run();

    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read skill directory'),
    );
  });

  it('should handle evolution errors', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'error-skill', exemplar_module: 'path' }],
        }),
      } as unknown as Architect;
    });

    vi.mocked(Pipeline.stageAuditor).mockImplementation(() => {
      throw new Error('Pipeline Failed');
    });

    await command.run();

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to evolve skill error-skill'),
    );
  });
});
