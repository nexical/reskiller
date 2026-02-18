import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Bundler } from '../../../src/core/Bundler.js';
import * as fs from 'node:fs';
import { ReskillConfig } from '../../../src/config.js';

vi.mock('node:fs');

describe('Bundler', () => {
  const mockConfig = {};
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

  it('should symlink individual project skills with project-name prefix', async () => {
    const projects = [{ name: 'core', path: '/mock/core', skillDir: '/mock/core/.skills' }];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'auth', isDirectory: () => true },
      { name: 'db', isDirectory: () => true },
    ] as any);

    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    await bundler.bundle(projects);

    expect(fs.symlinkSync).toHaveBeenCalledWith(
      '/mock/core/.skills/auth',
      expect.stringContaining('core-auth'),
      'dir',
    );
    expect(fs.symlinkSync).toHaveBeenCalledWith(
      '/mock/core/.skills/db',
      expect.stringContaining('core-db'),
      'dir',
    );
  });
});
