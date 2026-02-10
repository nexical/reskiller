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
      discovery: {
        root: '.',
        markers: ['.skills'],
        ignore: ['node_modules'],
        depth: 5,
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
      outputs: {
        contextFiles: [],
      },
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(minimalConfig));

    const config = loadConfig(mockCwd);
    expect(config.skillsDir).toBe('skills');
    expect(config.discovery.root).toBe('.');
  });

  it('should use default cwd if not provided', () => {
    const validConfig = {
      skillsDir: 'custom-skills',
      constitution: { architecture: 'Arch' },
      discovery: {
        root: '.',
      },
      outputs: {
        contextFiles: ['ctx.md'],
      },
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validConfig));

    const spy = vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);

    const config = loadConfig();
    expect(config).toBeDefined();
    expect(fs.existsSync).toHaveBeenCalledWith(mockConfigPath);

    spy.mockRestore();
  });
});
