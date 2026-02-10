import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Bundler } from '../../../src/core/Bundler.js';
import * as fs from 'node:fs';
import { ReskillConfig } from '../../../src/config.js';

vi.mock('node:fs');

describe('Bundler', () => {
  const mockConfig = {
    skillsDir: 'skills',
  };
  const mockCwd = '/mock/cwd';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('should clean and recreate bundle directory', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    await bundler.bundle([]);

    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('.reskill/skills'),
      expect.any(Object),
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.reskill/skills'),
      expect.any(Object),
    );
  });

  it('should symlink project skills', async () => {
    const projects = [{ name: 'core', path: '/mock/core', skillDir: '/mock/core/.skills' }];
    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    await bundler.bundle(projects);

    expect(fs.symlinkSync).toHaveBeenCalledWith(
      '/mock/core/.skills',
      expect.stringContaining('core'),
      'dir',
    );
  });

  it('should bundle global skills if they exist and are not already in projects', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => (p as string).endsWith('skills'));

    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    await bundler.bundle([]);

    expect(fs.symlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('skills'),
      expect.stringContaining('_global'),
      'dir',
    );
  });
});
