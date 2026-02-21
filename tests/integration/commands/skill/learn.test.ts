import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestProject } from '../../setup.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { CLI } from '@nexical/cli-core';

describe('LearnCommand Integration', () => {
  let projectDir: string;
  let LearnCommand: typeof import('../../../../src/commands/skill/learn.js').default;
  let command: InstanceType<typeof import('../../../../src/commands/skill/learn.js').default>;

  beforeEach(async () => {
    vi.resetModules(); // Clear cache
    vi.resetAllMocks();

    projectDir = createTestProject('evolve-test');
    // Create .skills dir to satisfy scanner
    fs.mkdirSync(path.join(projectDir, '.skills'), { recursive: true });

    // Mock child_process
    vi.doMock('node:child_process', () => ({
      execSync: vi.fn(),
      spawn: vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      })),
    }));

    // Mock Pipeline dynamically
    vi.doMock('../../../../src/core/Pipeline.js', () => ({
      ensureTmpDir: vi.fn(),
      stageAuditor: vi.fn().mockReturnValue('canon.md'),
      stageCritic: vi.fn().mockReturnValue('drift.md'),
      stageInstructor: vi.fn(),
      updateContextFiles: vi.fn(),
    }));

    // Mock Explorer
    vi.doMock('../../../../src/core/Explorer.js', () => {
      class Explorer {
        static mockConstructor = vi.fn();
        constructor(...args: unknown[]) {
          Explorer.mockConstructor(...args);
        }
        async discover() {
          return 'kg.json';
        }
      }
      return { Explorer };
    });

    // Mock Bundler
    vi.doMock('../../../../src/core/Bundler.js', () => ({
      Bundler: class {
        constructor() {}
        async bundle() {
          return '';
        }
        getBundleDir() {
          return '/mock/bundle/dir';
        }
      },
    }));

    // Mock Architect
    vi.doMock('../../../../src/core/Architect.js', () => ({
      Architect: class {
        constructor() {}
        async strategize() {
          return {
            plan: [
              {
                type: 'create_skill',
                target_skill: 'test-skill',
                pattern_path: 'modules/test-mod',
              },
            ],
          };
        }
      },
    }));

    // Mock Initializer
    vi.doMock('../../../../src/core/Initializer.js', () => ({
      Initializer: { initialize: vi.fn() },
    }));

    // Mock Hooks
    vi.doMock('../../../../src/core/Hooks.js', () => ({
      hooks: {
        onDriftDetected: vi.fn(),
        onSkillUpdated: vi.fn(),
      },
    }));

    // Mock SetupCommand
    vi.doMock('../../../../src/commands/skill/setup.js', () => ({
      default: class {
        constructor() {}
        async run() {
          return true;
        }
      },
    }));

    // Import Command
    const mod = await import('../../../../src/commands/skill/learn.js');
    LearnCommand = mod.default;

    const mockCli = {
      getRawCLI: vi.fn().mockReturnValue({
        outputHelp: vi.fn(),
      }),
    } as unknown as CLI;

    command = new LearnCommand(mockCli);
    (command as unknown as { config: unknown }).config = {
      reskill: {
        discovery: { root: projectDir, markers: ['.skills'], ignore: [], depth: 5 },
        outputs: { contextFiles: [], symlinks: [] },
        constitution: { architecture: 'Test', patterns: 'Test Patterns' },
      },
    };
    (command as unknown as { projectRoot: string }).projectRoot = projectDir;

    command.info = vi.fn();
    command.error = vi.fn();
    command.success = vi.fn();
    command.warn = vi.fn();
  });

  it('should execute evolution plan and create skills', async () => {
    const moduleDir = path.join(projectDir, 'modules/test-mod');
    fs.mkdirSync(moduleDir, { recursive: true });

    await command.run();

    const skillDir = path.join(projectDir, '.skills/test-skill');
    expect(fs.existsSync(skillDir)).toBe(true);
  });

  it('should scope evolution when directory argument is provided', async () => {
    fs.mkdirSync(path.join(projectDir, 'sub2/.skills'), { recursive: true });
    const { Explorer } = await import('../../../../src/core/Explorer.js');

    await command.run({ directory: 'sub2' });

    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Scoping learning to:'));
    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining(path.join(projectDir, 'sub2')),
    );

    const explorerCalls = (
      Explorer as unknown as { mockConstructor: { mock: { calls: unknown[][] } } }
    ).mockConstructor.mock.calls;
    expect(explorerCalls.length).toBeGreaterThan(0);
    const projectsArg = explorerCalls[0][0] as { path: string }[];
    expect(projectsArg).toHaveLength(1);
    expect(projectsArg[0].path).toBe(path.join(projectDir, 'sub2'));
  });

  it('should error if the scoped directory does not exist', async () => {
    await command.run({ directory: 'non-existent' });
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Scoped directory does not exist'),
    );
  });
});
