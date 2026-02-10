import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig } from '../../src/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('node:fs');

describe('config', () => {
  const mockCwd = '/test/cwd';
  const mockConfigPath = path.join(mockCwd, 'reskill.config.json');

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should load a valid configuration', () => {
    const validConfig = {
      skillsDir: 'custom-skills',
      constitution: { architecture: 'Arch' },
      input: {
        platformDirs: [{ name: 'core', path: 'core' }],
        moduleDirs: ['modules'],
      },
      outputs: {
        contextFiles: ['ctx.md'],
        symlinks: [],
      },
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validConfig));

    const config = loadConfig(mockCwd);
    expect(config).toEqual(expect.objectContaining(validConfig));
    expect(config.outputs.symlinks).toEqual([]); // Default value
  });

  it('should throw if configuration file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => loadConfig(mockCwd)).toThrow(/Configuration file not found/);
  });

  it('should use default values where applicable', () => {
    const minimalConfig = {
      constitution: { architecture: 'Arch' },
      input: {
        platformDirs: [],
        moduleDirs: [],
      },
      outputs: {
        contextFiles: [],
      },
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(minimalConfig));

    const config = loadConfig(mockCwd);
    expect(config.skillsDir).toBe('skills');
  });

  it('should use default cwd if not provided', () => {
    const validConfig = {
      skillsDir: 'custom-skills',
      constitution: { architecture: 'Arch' },
      input: {
        platformDirs: [{ name: 'core', path: 'core' }],
        moduleDirs: ['modules'],
      },
      outputs: {
        contextFiles: ['ctx.md'],
      },
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validConfig));

    // We can't easily assert on process.cwd() usage without spying on path.join or fs calls with process.cwd()
    // But we can ensure it doesn't throw and loads config expected at process.cwd()

    // Mock process.cwd to return our mockCwd
    // Note: vitest globals might make this tricky, but let's try
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);

    const config = loadConfig();
    expect(config).toBeDefined();
    expect(fs.existsSync).toHaveBeenCalledWith(mockConfigPath);

    spy.mockRestore();
  });
});
