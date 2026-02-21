import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSymlinks } from '../../../src/core/Symlinker.js';
import * as fs from 'node:fs';
import { ReskillConfig } from '../../../src/config.js';
import { logger } from '../../../src/core/Logger.js';

vi.mock('node:fs');

describe('Symlinker', () => {
  const mockConfig = {
    outputs: {
      symlinks: ['target/link'],
    },
  };
  const mockCwd = '/test/cwd';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false); // Default: nothing exists
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.symlinkSync).mockImplementation(() => {});
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.lstatSync).mockImplementation(
      () => ({ isSymbolicLink: () => false }) as unknown as fs.Stats,
    );
    vi.mocked(fs.readFileSync).mockReturnValue('');
  });

  it('should create symlinks if they do not exist', () => {
    ensureSymlinks(mockConfig as unknown as ReskillConfig, mockCwd);

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.symlinkSync).toHaveBeenCalled();
  });

  it('should do nothing if symlinks array is empty', () => {
    const emptyConfig = { ...mockConfig, outputs: { symlinks: [] } };
    ensureSymlinks(emptyConfig as unknown as ReskillConfig, mockCwd);
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('should do nothing if symlinks array is undefined', () => {
    const emptyConfig = { ...mockConfig, outputs: {} };
    ensureSymlinks(emptyConfig as unknown as ReskillConfig, mockCwd);
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('should create .gitignore if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false); // gitignore missing
    ensureSymlinks(mockConfig as unknown as ReskillConfig, mockCwd);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.gitignore'),
      expect.stringContaining('target/link'),
      'utf-8',
    );
  });

  it('should update gitignore if needed', () => {
    vi.mocked(fs.existsSync).mockImplementation(((p: string) => {
      if (p.endsWith('.gitignore')) return true;
      return false;
    }) as unknown as typeof fs.existsSync);
    vi.mocked(fs.readFileSync).mockReturnValue('old/path' as unknown as string);

    ensureSymlinks(mockConfig as unknown as ReskillConfig, mockCwd);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.gitignore'),
      expect.stringContaining('target/link'),
      'utf-8',
    );
  });

  it('should warn if target exists but is not a symlink', () => {
    vi.mocked(fs.existsSync).mockImplementation(((p: string) => {
      if (p.endsWith('target/link')) return true;
      // Ensure parent dir exists also
      if (p.includes('target')) return true;
      return false;
    }) as unknown as typeof fs.existsSync);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => false } as unknown as fs.Stats);

    ensureSymlinks(mockConfig as unknown as ReskillConfig, mockCwd);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exists and is NOT a symlink'));
    warnSpy.mockRestore();
  });

  it('should skip if target exists and IS a symlink', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as unknown as fs.Stats);

    ensureSymlinks(mockConfig as unknown as ReskillConfig, mockCwd);
    // Should not warn, should not create
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fs.symlinkSync).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should handle errors during symlink creation', () => {
    vi.mocked(fs.existsSync).mockImplementation(((p: string) => {
      if (p.includes('target')) return false; // Target does not exist
      return true; // Parent exists
    }) as unknown as typeof fs.existsSync);

    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.mocked(fs.symlinkSync).mockImplementation(() => {
      throw new Error('Symlink failed');
    });

    ensureSymlinks(mockConfig as unknown as ReskillConfig, mockCwd);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to create symlink'));
    errorSpy.mockRestore();
  });

  it('should not update gitignore if link already present', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p.toString().endsWith('.gitignore'));
    vi.mocked(fs.readFileSync).mockReturnValue('target/link');

    ensureSymlinks(mockConfig as unknown as ReskillConfig, mockCwd);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
