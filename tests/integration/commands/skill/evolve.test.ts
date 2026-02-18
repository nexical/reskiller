import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestProject } from '../../setup.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { CLI } from '@nexical/cli-core';

describe('EvolveCommand Integration', () => {
  let projectDir: string;
  let EvolveCommand: any;
  let command: any;

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
    vi.doMock('../../../../src/core/Explorer.js', () => ({
      Explorer: class {
        static async discover() {
          return [];
        }
        async discover() {
          return [];
        }
      },
    }));

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
                exemplar_module: 'modules/test-mod',
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

    // Import Command
    const mod = await import('../../../../src/commands/skill/evolve.js');
    EvolveCommand = mod.default;

    // Setup mock CLI with config
    const mockCli = {
      // ...
    } as unknown as CLI;

    command = new EvolveCommand(mockCli);

    // Manually inject config that would come from cli-core
    (command as any).config = {
      reskill: {
        skillsDir: 'skills',
        discovery: { root: '.', markers: ['.skills'], ignore: [], depth: 5 },
        outputs: { contextFiles: [], symlinks: [] },
        constitution: { architecture: 'Test' },
      },
    };
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
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('Context files updated'));

    // Verify skill directory creation (Architect planned 'test-skill')
    const skillDir = path.join(projectDir, 'skills/test-skill');
    expect(fs.existsSync(skillDir)).toBe(true);
  });
});
