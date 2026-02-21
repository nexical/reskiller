import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TEST_TMP_DIR } from '../setup.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { CLI } from '@nexical/cli-core';
import * as yaml from 'yaml';

describe('InitCommand Integration', () => {
  let projectDir: string;
  let InitCommand: typeof import('../../../src/commands/init.js').default;
  let command: InstanceType<typeof import('../../../src/commands/init.js').default>;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();

    const projectName = `init-test-${Math.random().toString(36).substring(2, 7)}`;
    projectDir = path.join(TEST_TMP_DIR, projectName);
    fs.mkdirSync(projectDir, { recursive: true });

    const mod = await import('../../../src/commands/init.js');
    InitCommand = mod.default;

    const mockCli = {
      getRawCLI: vi.fn().mockReturnValue({
        outputHelp: vi.fn(),
      }),
    } as unknown as CLI;

    command = new InitCommand(mockCli);
    // @ts-expect-error - overriding protected property
    command.projectRoot = projectDir;
    // @ts-expect-error - overriding protected property
    command.globalOptions = { debug: false };

    // Mock logger methods to avoid cluttering test output and for verification
    command.info = vi.fn();
    command.success = vi.fn();
    command.error = vi.fn();
    command.warn = vi.fn();
  });

  it('should create reskiller.yaml in root when no config exists', async () => {
    await command.run();

    const reskillerYamlPath = path.join(projectDir, 'reskiller.yaml');
    expect(fs.existsSync(reskillerYamlPath)).toBe(true);

    const content = fs.readFileSync(reskillerYamlPath, 'utf-8');
    const config = yaml.parse(content);
    expect(config.constitution.architecture).toBe('.reskill/architecture.md');
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('Created reskiller.yaml'));
  });

  it('should add reskill section to existing nexical.yaml', async () => {
    const nexicalYamlPath = path.join(projectDir, 'nexical.yaml');
    fs.writeFileSync(nexicalYamlPath, 'name: test-project\nversion: 1.0.0\n');

    await command.run();

    const content = fs.readFileSync(nexicalYamlPath, 'utf-8');
    const config = yaml.parse(content);
    expect(config.reskill).toBeDefined();
    expect(config.reskill.constitution.architecture).toBe('.reskill/architecture.md');
    expect(command.success).toHaveBeenCalledWith(
      expect.stringContaining('Added reskill configuration to nexical.yaml'),
    );
  });

  it('should skip if reskill section already exists in nexical.yaml', async () => {
    const nexicalYamlPath = path.join(projectDir, 'nexical.yaml');
    fs.writeFileSync(nexicalYamlPath, 'reskill:\n  constitution:\n    architecture: existing.md\n');

    await command.run();

    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('Reskill configuration already exists in nexical.yaml'),
    );

    const content = fs.readFileSync(nexicalYamlPath, 'utf-8');
    const config = yaml.parse(content);
    expect(config.reskill.constitution.architecture).toBe('existing.md');
  });

  it('should initialize a scoped directory with partial config', async () => {
    const scope = 'sub-app';
    const scopeDir = path.join(projectDir, scope);

    await command.run({ directory: scope });

    expect(fs.existsSync(scopeDir)).toBe(true);
    const reskillerYamlPath = path.join(scopeDir, 'reskiller.yaml');
    expect(fs.existsSync(reskillerYamlPath)).toBe(true);

    const content = fs.readFileSync(reskillerYamlPath, 'utf-8');
    const config = yaml.parse(content);
    expect(config.constitution.architecture).toBe('.reskill/architecture.md');
    expect(config.discovery).toBeUndefined(); // Scoped config should be partial

    expect(command.success).toHaveBeenCalledWith(
      expect.stringContaining(`Created ${path.join(scope, 'reskiller.yaml')}`),
    );
  });

  it('should skip if scoped directory already has reskiller.yaml', async () => {
    const scope = 'existing-sub';
    const scopeDir = path.join(projectDir, scope);
    fs.mkdirSync(scopeDir, { recursive: true });
    const reskillerYamlPath = path.join(scopeDir, 'reskiller.yaml');
    fs.writeFileSync(reskillerYamlPath, 'constitution:\n  architecture: custom.md\n');

    await command.run({ directory: scope });

    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('Reskill configuration already exists'),
    );

    const content = fs.readFileSync(reskillerYamlPath, 'utf-8');
    const config = yaml.parse(content);
    expect(config.constitution.architecture).toBe('custom.md');
  });
});
