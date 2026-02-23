import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Bundler } from '../../../src/core/Bundler.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
    // @ts-expect-error - mock return type mismatch
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'auth', isDirectory: () => true },
      { name: 'db', isDirectory: () => true },
    ] as unknown as fs.Dirent[]);

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

  it('should handle errors when reading project skill directory', async () => {
    const projects = [{ name: 'fail', path: '/mock/fail', skillDir: '/mock/fail/.skills' }];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('Read failed');
    });

    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    await bundler.bundle(projects);
    // Should not throw, but log a warning (which is not easily verified without mocking logger, but we cover the branch)
  });

  it('should handle errors when creating symlinks', async () => {
    const projects = [{ name: 'fail', path: '/mock/fail', skillDir: '/mock/fail/.skills' }];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // @ts-expect-error - mock return type mismatch
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'skill-dir', isDirectory: () => true },
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.symlinkSync).mockImplementation(() => {
      throw new Error('Symlink failed');
    });

    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    await bundler.bundle(projects);
    // Should not throw
  });

  it('should use process.cwd() if cwd is not provided', () => {
    const bundler = new Bundler(mockConfig as unknown as ReskillConfig);
    expect(bundler.getBundleDir()).toBe(path.join(process.cwd(), '.reskill', 'skills'));
  });

  it('should handle missing bundle directory during bundle', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    await bundler.bundle([]);
    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(fs.mkdirSync).toHaveBeenCalled();
  });

  it('should skip if project skill directory does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    await (bundler as unknown as { linkProjectSkills: (p: unknown) => Promise<void> })[
      'linkProjectSkills'
    ]({ name: 'test', skillDir: '/dir' });
    expect(fs.readdirSync).not.toHaveBeenCalled();
  });

  it('should ignore non-directory entries in skill directory', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // @ts-expect-error - mock return type mismatch
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'skill-dir', isDirectory: () => true },
      { name: 'not-a-dir.txt', isDirectory: () => false },
    ] as unknown as fs.Dirent[]);

    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    await (bundler as unknown as { linkProjectSkills: (p: unknown) => Promise<void> })[
      'linkProjectSkills'
    ]({ name: 'proj', skillDir: '/dir' });

    expect(fs.symlinkSync).toHaveBeenCalledTimes(1);
    expect(fs.symlinkSync).toHaveBeenCalledWith(
      path.join('/dir', 'skill-dir'),
      expect.stringContaining('proj-skill-dir'),
      'dir',
    );
  });

  it('should return the bundle directory', () => {
    const bundler = new Bundler(mockConfig as unknown as ReskillConfig, mockCwd);
    expect(bundler.getBundleDir()).toBe(path.join(mockCwd, '.reskill', 'skills'));
  });
});
