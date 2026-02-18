import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestProject } from '../../setup.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { CLI } from '@nexical/cli-core';

describe('RefineCommand Integration', () => {
  let projectDir: string;
  let RefineCommand: any;
  let command: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();

    projectDir = createTestProject('refine-test');

    // Mock Pipeline
    vi.doMock('../../../../src/core/Pipeline.js', () => ({
      ensureTmpDir: vi.fn(),
      stageAuditor: vi.fn().mockReturnValue('canon.md'),
      stageCritic: vi.fn().mockReturnValue('drift.md'),
      stageInstructor: vi.fn(),
      updateContextFiles: vi.fn(),
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

    // Mock Explorer
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

    const mod = await import('../../../../src/commands/skill/refine.js');
    RefineCommand = mod.default;

    const mockCli = {} as unknown as CLI;
    command = new RefineCommand(mockCli);

    (command as any).config = {
      reskill: {
        skillsDir: 'skills',
        discovery: { root: '.', markers: ['.skills'], ignore: [], depth: 5 },
        outputs: { contextFiles: [], symlinks: [] },
        constitution: { architecture: 'Test' },
      },
    };
    (command as any).projectRoot = projectDir;

    command.info = vi.fn();
    command.error = vi.fn();
    command.success = vi.fn();
    command.warn = vi.fn();
  });

  it('should refine a specific skill', async () => {
    const moduleDir = path.join(projectDir, 'modules/target-mod');
    fs.mkdirSync(moduleDir, { recursive: true });

    await command.run({ skillName: 'target-skill', modulePath: moduleDir });

    if (vi.mocked(command.error).mock.calls.length > 0) {
      console.error('Command Error:', vi.mocked(command.error).mock.calls);
    }
    if (vi.mocked(command.warn).mock.calls.length > 0) {
      console.warn('Command Warn:', vi.mocked(command.warn).mock.calls);
    }

    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('Refinement complete'));

    // Check skill dir creation
    const skillDir = path.join(projectDir, 'skills/target-skill');
    expect(fs.existsSync(skillDir)).toBe(true);
  });
});
