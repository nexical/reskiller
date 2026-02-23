import { describe, it, expect, vi, beforeEach } from 'vitest';
import LearnCommand from '../../../../src/commands/skill/learn.js';
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
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));
vi.mock('../../../../src/agents/AgentRunner.js', () => ({
  AgentRunner: {
    run: vi.fn().mockResolvedValue('Recommendations'),
  },
}));
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    relative: vi.fn((from: string, to: string) => actual.relative(from, to)),
    isAbsolute: vi.fn((p: string) => actual.isAbsolute(p)),
  };
});
export const mockSetupRun = vi.fn().mockResolvedValue(true);
vi.mock('../../../../src/commands/skill/setup.js', () => {
  return {
    default: function MockSetupCommand() {
      return {
        run: mockSetupRun,
      };
    },
  };
});

// Mock CLI
const mockCli = {} as unknown as CLI;

describe('LearnCommand', () => {
  let command: LearnCommand;
  const mockConfig = {
    discovery: { root: '.', markers: ['.skills'], ignore: [], depth: 1 },
    constitution: { architecture: 'Test', patterns: 'Test Patterns' },
    outputs: { contextFiles: [], symlinks: [] },
  } as configMod.ReskillConfig;

  beforeEach(() => {
    vi.resetAllMocks();
    command = new LearnCommand(mockCli);
    // Mock BaseCommand logger methods
    command.info = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();
    command.success = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (command as any).config = { reskill: mockConfig };

    vi.mocked(configMod.getReskillConfig).mockReturnValue(mockConfig);

    // Default FS mocks
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(Pipeline.getTmpDir).mockReturnValue('.agent/tmp/reskill');

    // Class mocks
    const mockProjects = [{ name: 'proj1', path: '/root/proj1', skillDir: '/root/proj1/.skills' }];
    vi.mocked(ProjectScanner).mockImplementation(function () {
      return {
        scan: vi.fn().mockResolvedValue(mockProjects),
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
          plan: [{ type: 'create_skill', target_skill: 'test-skill', pattern_path: 'path' }],
        }),
      } as unknown as Architect;
    });

    await command.run();
    expect(Pipeline.ensureTmpDir).toHaveBeenCalled();
    // SetupCommand mock verification
    expect(mockSetupRun).toHaveBeenCalled();
  });

  it('should create skill directory if missing', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'new-skill', pattern_path: 'path' }],
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
            { type: 'create_skill', target_skill: 's1', pattern_path: undefined },
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
    }) as unknown as typeof fs.readdirSync);

    // Architect plans to update this distributed skill
    // With the new naming convention, the skill name in the plan should be "proj1-distributed-skill"
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            {
              type: 'update_skill',
              target_skill: 'proj1-distributed-skill',
              pattern_path: 'path',
            },
          ],
        }),
      } as unknown as Architect;
    });

    await command.run();

    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('Targeting distributed skill'),
    );
    // Verify it targets the distributed path
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      path.join('/root/proj1/.skills', 'distributed-skill'),
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
          plan: [{ type: 'create_skill', target_skill: 'error-skill', pattern_path: 'path' }],
        }),
      } as unknown as Architect;
    });

    vi.mocked(Pipeline.stageAuditor).mockImplementation(() => {
      throw new Error('Pipeline Failed');
    });

    await command.run();

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to learn skill error-skill'),
    );
  });

  it('should skip skill if pattern path is outside scope', async () => {
    // @ts-expect-error - set projectRoot
    command.projectRoot = '/root';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            {
              type: 'create_skill',
              target_skill: 'scoped-skill',
              pattern_path: '../../outside/path',
            },
          ],
        }),
      } as unknown as Architect;
    });

    await command.run({ directory: 'scope' });

    expect(Pipeline.stageAuditor).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining('is outside the allowed scope'),
    );
  });

  it('should create skill in the first project if skill name is not in index', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'brand-new-skill', pattern_path: 'path' }],
        }),
      } as unknown as Architect;
    });

    await command.run();

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('proj1/.skills/brand-new-skill'),
      expect.any(Object),
    );
  });

  it('should error if no projects found to host a new skill', async () => {
    vi.mocked(ProjectScanner).mockImplementation(function () {
      return {
        scan: vi.fn().mockResolvedValue([]),
      } as unknown as ProjectScanner;
    });
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'brand-new-skill', pattern_path: 'path' }],
        }),
      } as unknown as Architect;
    });

    await command.run();

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('no projects found to host it'),
    );
  });

  it('should retry verification on failure and succeed if subsequent attempt passes', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'retry-skill', pattern_path: 'path' }],
        }),
      } as unknown as Architect;
    });

    const { execSync } = await import('node:child_process');
    vi.mocked(execSync)
      .mockImplementationOnce(() => {
        throw { stdout: Buffer.from('Lint error') };
      })
      .mockImplementation(() => Buffer.from('Success'));

    await command.run();

    expect(Pipeline.stageInstructor).toHaveBeenCalledTimes(2);
    expect(command.success).toHaveBeenCalledWith(
      expect.stringContaining('retry-skill passed verification'),
    );
  });

  it('should compile recommendations when not in edit mode', async () => {
    await command.run({ edit: false });
    const { AgentRunner } = await import('../../../../src/agents/AgentRunner.js');
    expect(AgentRunner.run).toHaveBeenCalledWith(
      'Recommender',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('should error if scoping directory does not exist', async () => {
    // @ts-expect-error - set projectRoot
    command.projectRoot = '/root';
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === '/root/missing') return false;
      return true;
    });

    await command.run({ directory: 'missing' });
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Scoped directory does not exist'),
    );
  });

  it('should log error when max verification attempts are exhausted', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'fail-skill', pattern_path: 'path' }],
        }),
      } as unknown as Architect;
    });

    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Permanent Failure');
    });

    await command.run();

    expect(Pipeline.stageInstructor).toHaveBeenCalledTimes(3);
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to verify skill fail-skill after 3 attempts'),
    );
  });

  it('should handle verification failures with just stderr', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 's1', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockImplementation(() => {
      throw { stderr: Buffer.from('stderr error') };
    });

    await command.run();
    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('stderr error'));
  });

  it('should create skill directory if missing', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'new-skill', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p.toString().includes('new-skill')) return false;
      return true;
    });

    await command.run();
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('new-skill'),
      expect.any(Object),
    );
  });

  it('should handle config loading failure', async () => {
    vi.mocked(configMod.getReskillConfig).mockImplementation(() => {
      throw new Error('Config load fail');
    });
    await command.run();
    expect(command.error).toHaveBeenCalledWith('Config load fail');
  });

  it('should handle verification failures with stdout', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 's1', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockImplementation(() => {
      throw { stdout: Buffer.from('stdout error') };
    });

    await command.run();
    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('stdout error'));
  });

  it('should skip Explorer and Architect when resuming with valid state', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString().includes('state.json')) return true;
      if (p.toString().includes('skill-plan.json')) return true;
      if (p.toString().includes('knowledge-graph.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor) => {
      if (p.toString().includes('state.json'))
        return JSON.stringify({ completedSkills: ['already-done'] });
      if (p.toString().includes('skill-plan.json'))
        return JSON.stringify({
          plan: [{ type: 'create_skill', target_skill: 'new-skill', pattern_path: 'path' }],
        });
      return '';
    });

    const mockDiscover = vi.fn();
    vi.mocked(Explorer).mockImplementation(function () {
      return { discover: mockDiscover } as unknown as Explorer;
    });

    const mockStrategize = vi.fn();
    vi.mocked(Architect).mockImplementation(function () {
      return { strategize: mockStrategize } as unknown as Architect;
    });

    await command.run({ resume: true });

    expect(mockDiscover).not.toHaveBeenCalled();
    expect(mockStrategize).not.toHaveBeenCalled();
    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('Skipping Explore and Strategize phases (resuming).'),
    );
  });

  it('should skip already completed skills when resuming', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString().includes('state.json')) return true;
      if (p.toString().includes('skill-plan.json')) return true;
      if (p.toString().includes('knowledge-graph.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor) => {
      if (p.toString().includes('state.json'))
        return JSON.stringify({ completedSkills: ['done-skill'] });
      if (p.toString().includes('skill-plan.json'))
        return JSON.stringify({
          plan: [
            { type: 'create_skill', target_skill: 'done-skill', pattern_path: 'path' },
            { type: 'create_skill', target_skill: 'pending-skill', pattern_path: 'path' },
          ],
        });
      return '';
    });

    await command.run({ resume: true });

    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('Skipping done-skill: already completed.'),
    );
    // Make sure the pending-skill is still targeted
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('pending-skill'),
      expect.any(Object),
    );
  });

  it('should clear old state if not resuming', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString().includes('state.json')) return true;
      return false;
    });
    vi.mocked(fs.unlinkSync).mockImplementation(() => {});

    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 's1', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });

    await command.run({ resume: false });

    // The state file should be unlinked
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('state.json'));
  });

  it('should handle corrupted state file when resuming', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString().includes('state.json')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue('invalid-json');

    await command.run({ resume: true });

    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse state file'),
    );
  });

  it('should handle missing state file when resuming', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString().includes('state.json')) return false;
      return false;
    });

    await command.run({ resume: true });

    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('No state file found'));
  });

  it('should handle corrupted skill plan when resuming', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString().includes('state.json')) return true;
      if (p.toString().includes('skill-plan.json')) return true;
      if (p.toString().includes('knowledge-graph.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor) => {
      if (p.toString().includes('state.json')) return JSON.stringify({ completedSkills: [] });
      if (p.toString().includes('skill-plan.json')) return 'invalid-json';
      return '';
    });

    await command.run({ resume: true });

    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load existing plan'),
    );
  });

  it('should handle non-skill plan items', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'unknown_type', name: 'whatever' }],
        }),
      } as unknown as Architect;
    });

    await command.run();
    expect(Pipeline.stageAuditor).not.toHaveBeenCalled();
  });

  it('should skip skill if pattern path is absolute and outside scope', async () => {
    // @ts-expect-error - set projectRoot
    command.projectRoot = '/root';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            {
              type: 'create_skill',
              target_skill: 'scoped-skill',
              pattern_path: '/outside/path',
            },
          ],
        }),
      } as unknown as Architect;
    });

    vi.mocked(path.relative).mockReturnValue('absolute/path'); // Not starting with ..
    vi.mocked(path.isAbsolute).mockReturnValue(true);

    await command.run({ directory: 'scope' });

    expect(Pipeline.stageAuditor).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining('is outside the allowed scope'),
    );
    vi.mocked(path.relative).mockRestore();
    vi.mocked(path.isAbsolute).mockRestore();
  });

  it('should skip skill if relative path is exactly ..', async () => {
    // @ts-expect-error - set projectRoot
    command.projectRoot = '/root';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            {
              type: 'create_skill',
              target_skill: 'scoped-skill',
              pattern_path: '../outside',
            },
          ],
        }),
      } as unknown as Architect;
    });

    vi.mocked(path.relative).mockReturnValue('..');

    await command.run({ directory: 'scope' });

    expect(Pipeline.stageAuditor).not.toHaveBeenCalled();
    vi.mocked(path.relative).mockRestore();
  });

  it('should handle verification failures with only message', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 's1', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('simple message error');
    });

    await command.run();
    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('simple message error'));
  });

  it('should handle verification failures with toString', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 's1', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockImplementation(() => {
      throw 'string error';
    });

    await command.run();
    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('string error'));
  });

  it('should skip recommendations and audit/critic edit mode when edit is true', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 's1', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });

    await command.run({ edit: true });

    expect(Pipeline.stageAuditor).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(String),
      true,
    );
    const { AgentRunner } = await import('../../../../src/agents/AgentRunner.js');
    expect(AgentRunner.run).not.toHaveBeenCalledWith(
      'Recommender',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('should skip non-directory files in distributed skill index', async () => {
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
    vi.mocked(fs.readdirSync).mockImplementation(((p: fs.PathLike) => {
      if (p.toString().includes('.skills') && !p.toString().includes('prompts')) {
        return [
          {
            name: 'not-a-dir',
            isDirectory: () => false,
          } as unknown as fs.Dirent,
        ];
      }
      return [];
    }) as unknown as typeof fs.readdirSync);

    await command.run();

    // The distributedSkillIndex should be empty
    expect(command.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Targeting distributed skill'),
    );
  });

  it('should skip creating directory if skillPath already exists', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: 'existing-skill', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p.toString().includes('existing-skill')) return true;
      return true;
    });

    await command.run();
    expect(fs.mkdirSync).not.toHaveBeenCalledWith(
      expect.stringContaining('existing-skill'),
      expect.any(Object),
    );
  });

  it('should use name if target_skill is missing in plan item', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [
            {
              type: 'create_skill',
              name: 'fallback-skill',
              pattern_path: 'path/to/pattern',
            },
          ],
        }),
      } as unknown as Architect;
    });

    await command.run();

    expect(Pipeline.stageAuditor).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'fallback-skill' }),
      expect.anything(),
      expect.anything(),
      undefined,
    );
  });

  it('should fall back to explore if resume is true but plan files are missing', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p.toString().includes('skill-plan.json')) return false;
      return true;
    });
    await command.run({ resume: true });
    expect(Explorer).toHaveBeenCalled();
  });

  it('should handle update_skill item type', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'update_skill', target_skill: 's1', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });
    await command.run();
    expect(Pipeline.stageAuditor).toHaveBeenCalled();
  });

  it('should fallback to name if target_skill is empty string', async () => {
    vi.mocked(Architect).mockImplementation(function () {
      return {
        strategize: vi.fn().mockResolvedValue({
          plan: [{ type: 'create_skill', target_skill: '', name: 'n1', pattern_path: 'p1' }],
        }),
      } as unknown as Architect;
    });
    await command.run();
    expect(Pipeline.stageAuditor).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'n1' }),
      expect.anything(),
      expect.anything(),
      undefined,
    );
  });
});
