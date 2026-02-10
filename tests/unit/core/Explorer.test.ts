import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Explorer } from '../../../src/core/Explorer.js';
import * as fs from 'node:fs';

vi.mock('node:fs');
vi.mock('../../../src/agents/AgentRunner');

describe('Explorer', () => {
  const mockParams = {
    moduleDirs: ['/mock/modules'],
    platformDirs: [{ name: 'core', path: '/mock/core' }],
    constitution: { architecture: 'Test Arch' },
    tmpDir: '/mock/tmp',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
  });

  it('should instantiate correctly', () => {
    const explorer = new Explorer(
      mockParams.moduleDirs,
      mockParams.platformDirs,
      mockParams.constitution,
      mockParams.tmpDir,
    );
    expect(explorer).toBeDefined();
  });

  it('should handle missing platform directories', async () => {
    const explorer = new Explorer(
      [],
      [{ name: 'missing', path: '/missing/path' }],
      mockParams.constitution,
      mockParams.tmpDir,
    );

    vi.mocked(fs.existsSync).mockReturnValue(false);
    // readdirSync shouldn't be called for missing dir

    await explorer.discover();

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('modules-index.json'),
      expect.stringContaining('"error": "Directory not found"'),
    );
  });

  it('should handle missing module directories', async () => {
    const explorer = new Explorer(
      ['/missing/modules'],
      [],
      mockParams.constitution,
      mockParams.tmpDir,
    );

    vi.mocked(fs.existsSync).mockImplementation(
      ((path: unknown) => (path as string) !== '/missing/modules') as unknown as (
        path: fs.PathLike,
      ) => boolean,
    );

    await explorer.discover();

    // Verify we proceeded without crashing
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should recursively list files ignoring excludes', async () => {
    const explorer = new Explorer(
      [],
      [{ name: 'core', path: '/mock/core' }],
      mockParams.constitution,
      mockParams.tmpDir,
    );

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Mock readdirSync for recursive structure
    vi.mocked(fs.readdirSync).mockImplementation(((dir: unknown) => {
      const dirStr = dir as string;
      if (dirStr === '/mock/core') return ['file1.ts', 'subdir', 'node_modules', '.git', 'dist'];
      if (dirStr === '/mock/core/subdir') return ['file2.ts'];
      return [];
    }) as unknown as (path: fs.PathLike) => any);

    vi.mocked(fs.statSync).mockImplementation(((filePath: unknown) => {
      const pathStr = filePath as string;
      if (
        pathStr.endsWith('subdir') ||
        pathStr.endsWith('node_modules') ||
        pathStr.endsWith('dist') ||
        pathStr.endsWith('.git')
      ) {
        return { isDirectory: () => true };
      }
      return { isDirectory: () => false };
    }) as unknown as (path: fs.PathLike) => any);

    await explorer.discover();

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('modules-index.json'),
      expect.stringContaining('file1.ts'),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('modules-index.json'),
      expect.stringContaining('file2.ts'),
    );
    // Should not contain ignored directories
    expect(fs.writeFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining('modules-index.json'),
      expect.stringContaining('node_modules'),
    );
  });

  it('should return empty list if directory does not exist in listFiles', async () => {
    // modifying listFiles directly is hard as it is private,
    // but we can trigger it via scanPlatform if we make existsSync return true first then false inside listFiles?
    // Actually listFiles checks existsSync right at start.
    // scanPlatform calls listFiles only if dir exists.
    // But what if a subdir disappears during recursion?

    const explorer = new Explorer(
      [],
      [{ name: 'flaky', path: '/mock/flaky' }],
      mockParams.constitution,
      mockParams.tmpDir,
    );

    // First check in scanPlatform returns true
    vi.mocked(fs.existsSync).mockImplementation(((path: unknown) => {
      const pathStr = path as string;
      if (pathStr === '/mock/flaky') return true;
      // When listFiles calls it
      if (pathStr === '/mock/flaky/disappears') return false;
      return true;
    }) as unknown as (path: fs.PathLike) => boolean);

    vi.mocked(fs.readdirSync).mockImplementation(((dir: unknown) => {
      const dirStr = dir as string;
      if (dirStr === '/mock/flaky') return ['disappears'];
      // when listing disappears, it returns empty? No, listFiles checks existsSync first.
      return [];
    }) as unknown as (path: fs.PathLike) => any);

    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);

    await explorer.discover();
    // Just ensure no crash
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
