import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestProject } from '../../setup.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { CLI } from '@nexical/cli-core';

describe('SetupCommand Integration', () => {
  let projectDir: string;
  let SetupCommand: typeof import('../../../../src/commands/skill/setup.js').default;
  let command: InstanceType<typeof import('../../../../src/commands/skill/setup.js').default>;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();

    projectDir = createTestProject('setup-test');
    // Create some skills to be bundled
    const skillDir = path.join(projectDir, '.skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill');

    // Mock dependencies that are hard to run in integration tests (like those making network calls or complex side effects)
    vi.doMock('../../../../src/core/Initializer.js', () => ({
      Initializer: { initialize: vi.fn() },
    }));

    // We want to test if symlinking and context updates are CALLED, but maybe not actually execute them if they are too complex
    // But let's try to let them run if possible, or mock them if they fail.
    // Actually, Pipeline.updateContextFiles might be complex. Let's mock it.
    vi.doMock('../../../../src/core/Pipeline.js', () => ({
      updateContextFiles: vi.fn().mockResolvedValue(undefined),
    }));

    const mod = await import('../../../../src/commands/skill/setup.js');
    SetupCommand = mod.default;

    const mockCli = {} as unknown as CLI;
    command = new SetupCommand(mockCli);
    // @ts-expect-error - overriding protected property
    command.projectRoot = projectDir;
    // @ts-expect-error - overriding protected property
    command.globalOptions = { debug: false };
    // @ts-expect-error - overriding protected property
    command.config = {
      reskill: {
        discovery: { root: projectDir, markers: ['.skills'], ignore: [], depth: 5 },
        outputs: { contextFiles: [], symlinks: [] },
        constitution: { architecture: 'Test' },
      },
    };

    command.info = vi.fn();
    command.success = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();
  });

  it('should clean integration directory and bundle skills', async () => {
    const integrationDir = path.join(projectDir, '.reskill', 'skills');
    fs.mkdirSync(integrationDir, { recursive: true });
    fs.writeFileSync(path.join(integrationDir, 'old-skill'), 'garbage');

    await command.run();

    // Verify integration dir was cleaned and new skill bundled
    expect(fs.existsSync(path.join(integrationDir, 'old-skill'))).toBe(false);
    expect(fs.existsSync(path.join(integrationDir, 'setup-test-test-skill'))).toBe(true);

    expect(command.success).toHaveBeenCalledWith(
      expect.stringContaining('Skills successfully integrated'),
    );
  });

  it('should respect scoping when provided', async () => {
    const subDir = path.join(projectDir, 'sub');
    fs.mkdirSync(subDir, { recursive: true });

    await command.run({ directory: 'sub' });

    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Scoping setup to:'));
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining(subDir));
  });

  it('should error if scoped directory does not exist', async () => {
    await command.run({ directory: 'non-existent' });
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Scoped directory does not exist'),
    );
  });

  it('should handle config errors', async () => {
    // Force getReskillConfig to fail by removing nexical.yaml AND clearing in-memory config
    fs.unlinkSync(path.join(projectDir, 'nexical.yaml'));
    // @ts-expect-error - reset config
    command.config = {};

    await command.run();
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Reskill configuration not found'),
    );
  });
});
