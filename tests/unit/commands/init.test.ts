import { describe, it, expect, vi, beforeEach } from 'vitest';
import InitCommand from '../../../src/commands/init.js';
import inquirer from 'inquirer';
import * as fs from 'node:fs';
import { CLI } from '@nexical/cli-core';

vi.mock('inquirer');
vi.mock('node:fs');
vi.mock('node:fs/promises');

// Mock CLI instance
const mockCli = {} as unknown as CLI;

describe('InitCommand', () => {
  let command: InitCommand;

  beforeEach(() => {
    vi.resetAllMocks();

    command = new InitCommand(mockCli);
    // Mock BaseCommand logger methods
    command.info = vi.fn();
    command.success = vi.fn();
    command.warn = vi.fn();
    command.error = vi.fn();

    vi.mocked(inquirer.prompt).mockResolvedValue({
      platformPath: 'core/src',
      modulePatterns: 'modules/*',
      skillsDir: 'skills',
      archDoc: 'arch.md',
      symlinks: [],
    });
    vi.mocked(fs.existsSync).mockReturnValue(false); // Nothing exists initially
    vi.mocked(fs.mkdirSync).mockImplementation(() => ({}) as unknown as string | undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.cpSync).mockImplementation(() => {});
  });

  it('should create config and directories', async () => {
    await command.run();

    expect(inquirer.prompt).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'reskill.config.json',
      expect.stringContaining('core/src'),
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith('skills', expect.any(Object));
    expect(fs.mkdirSync).toHaveBeenCalledWith('.agent/prompts', expect.any(Object));
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('Setup complete'));
  });

  it('should copy prompts if found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: unknown) => {
      const pathStr = p as string;
      // Mock that source prompts exist
      if (pathStr.includes('prompts') && !pathStr.includes('.agent')) return true;
      return false;
    });

    await command.run();

    expect(fs.cpSync).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('Copied default prompts'));
  });

  it('should fallback to dist prompts if src not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => {
      return false;
    });

    let callCount = 0;
    vi.mocked(fs.existsSync).mockImplementation((p: unknown) => {
      const pathStr = p as string;
      if (
        pathStr.includes('prompts') &&
        !pathStr.includes('.agent') &&
        !pathStr.includes('.vscode')
      ) {
        callCount++;
        if (callCount === 2) return true; // Dist path
        return false; // Source path
      }
      return false;
    });

    await command.run();

    expect(fs.cpSync).toHaveBeenCalled();
  });

  it('should warn if prompts not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await command.run();

    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not find default prompts'),
    );
  });
});
