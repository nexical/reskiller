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

    // Mock Pipeline dynamically
    // Note: we must use absolute path or correct relative path
    // Relative to THIS test file: ../../../../src/core/Pipeline.js
    // Mock Pipeline dynamically
    vi.doMock('../../../../src/core/Pipeline.js', () => ({
      ensureTmpDir: vi.fn(),
      stageAuditor: vi.fn().mockReturnValue('canon.md'),
      stageCritic: vi.fn().mockReturnValue('drift.md'),
      stageInstructor: vi.fn(),
      updateContextFiles: vi.fn(),
    }));

    // Mock Explorer to prevent fs writes if Pipeline mock fails
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
          command.info('⚙️ Running Skill Integration Setup...');
          command.success('Skills successfully integrated');
          return true;
        }
      },
    }));

    // Import Command
    const mod = await import('../../../../src/commands/skill/learn.js');
    LearnCommand = mod.default;

    // Setup mock CLI with config
    const mockCli = {
      // ...
    } as unknown as CLI;

    command = new LearnCommand(mockCli);

    // Manually inject config that would come from cli-core
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (command as any).config = {
      reskill: {
        discovery: { root: projectDir, markers: ['.skills'], ignore: [], depth: 5 },
        outputs: { contextFiles: [], symlinks: [] },
        constitution: { architecture: 'Test', patterns: 'Test Patterns' },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (command as any).projectRoot = projectDir;

    // Mock logger to avoid clutter
    command.info = vi.fn();
    command.error = vi.fn();
    command.success = vi.fn();
    command.warn = vi.fn();
  });

  it('should execute evolution plan and create skills', async () => {
    // Create dummy module
    const moduleDir = path.join(projectDir, 'modules/test-mod');
    fs.mkdirSync(moduleDir, { recursive: true });

    await command.run();

    if (vi.mocked(command.error).mock.calls.length > 0) {
      console.error('Command Error:', vi.mocked(command.error).mock.calls);
    }
    if (vi.mocked(command.warn).mock.calls.length > 0) {
      console.warn('Command Warn:', vi.mocked(command.warn).mock.calls);
    }

    // Verify plan execution
    expect(command.success).toHaveBeenCalledWith(
      expect.stringContaining('Skills successfully integrated'),
    );

    // Verify skill directory creation (Architect planned 'test-skill')
    // It should be created in the .skills directory of the project
    const skillDir = path.join(projectDir, '.skills/test-skill');
    expect(fs.existsSync(skillDir)).toBe(true);
  });

  it('should scope evolution when directory argument is provided', async () => {
    // Create another subproject
    fs.mkdirSync(path.join(projectDir, 'sub2/.skills'), { recursive: true });

    const { Explorer } = await import('../../../../src/core/Explorer.js');

    // Run with relative path scope
    await command.run({ directory: 'sub2' });

    // Verify information log
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Scoping learning to:'));
    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining(path.join(projectDir, 'sub2')),
    );

    // Verify Explorer was called with only one project (the one in sub2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const explorerCalls = (Explorer as any).mockConstructor.mock.calls;
    expect(explorerCalls.length).toBeGreaterThan(0);
    const projectsArg = explorerCalls[0][0];

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
