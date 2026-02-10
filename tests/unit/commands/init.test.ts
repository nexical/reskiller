import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initCommand } from '../../../src/commands/init.js';
import inquirer from 'inquirer';
import * as fs from 'node:fs';

vi.mock('inquirer');
vi.mock('node:fs');
vi.mock('node:fs/promises'); // Just in case

describe('initCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(inquirer.prompt).mockResolvedValue({
      platformPath: 'core/src',
      modulePatterns: 'modules/*',
      skillsDir: 'skills',
      archDoc: 'arch.md',
      symlinks: [],
    });
    vi.mocked(fs.existsSync).mockReturnValue(false); // Nothing exists initially
    vi.mocked(fs.mkdirSync).mockImplementation(() => ({}) as any);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.cpSync).mockImplementation(() => {});
  });

  it('should create config and directories', async () => {
    await initCommand();

    expect(inquirer.prompt).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'reskill.config.json',
      expect.stringContaining('core/src'),
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith('skills', expect.any(Object));
    expect(fs.mkdirSync).toHaveBeenCalledWith('.agent/prompts', expect.any(Object));
  });

  it('should copy prompts if found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: unknown) => {
      const pathStr = p as string;
      // Mock that source prompts exist
      if (pathStr.includes('prompts') && !pathStr.includes('.agent')) return true;
      return false;
    });

    await initCommand();

    expect(fs.cpSync).toHaveBeenCalled();
  });

  it('should fallback to dist prompts if src not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => {
      return false;
    });

    // Wait, if I return false for everything, it fails.
    // I need to return true for the dist path.
    // Dist path is shorter?
    // ../../../prompts vs ../../prompts
    // I'll spy on existsSync or use a counter/flag

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

    await initCommand();

    expect(fs.cpSync).toHaveBeenCalled();
  });

  it('should warn if prompts not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await initCommand();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not find default prompts'));
    warnSpy.mockRestore();
  });
});
