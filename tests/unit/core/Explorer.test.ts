import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Explorer } from '../../../src/core/Explorer.js';
import * as fs from 'node:fs';

vi.mock('node:fs');
vi.mock('../../../src/agents/AgentRunner');

describe('Explorer', () => {
  const mockProjects = [
    { name: 'core', path: '/mock/core', skillDir: '/mock/core/.skills' },
    { name: 'module-a', path: '/mock/module-a', skillDir: '/mock/module-a/.skills' },
  ];
  const mockConfig = {
    constitution: { architecture: 'Test Arch', patterns: 'Test Patterns' },
  } as unknown as import('../../../src/config.js').ReskillConfig;
  const mockTmpDir = '/mock/tmp';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // @ts-expect-error - mock return type mismatch
    vi.mocked(fs.readdirSync).mockReturnValue(['existing-file'] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as unknown as fs.Stats);
  });

  it('should instantiate correctly', () => {
    const explorer = new Explorer(mockProjects, mockConfig, mockTmpDir);
    expect(explorer).toBeDefined();
  });

  it('should handle missing project directories', async () => {
    const explorer = new Explorer(
      [{ name: 'missing', path: '/missing/path', skillDir: '/missing/path/.skills' }],
      mockConfig,
      mockTmpDir,
    );

    vi.mocked(fs.existsSync).mockReturnValue(false);

    await explorer.discover();

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('modules-index.json'),
      expect.stringContaining('"files": []'),
    );
  });

  it('should recursively list files ignoring excludes', async () => {
    const explorer = new Explorer(
      [{ name: 'core', path: '/mock/core', skillDir: '/mock/core/.skills' }],
      mockConfig,
      mockTmpDir,
    );

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Mock readdirSync for recursive structure
    vi.mocked(fs.readdirSync).mockImplementation(((dir: string) => {
      const dirStr = dir;
      if (dirStr === '/mock/core')
        return [
          'file1.ts',
          'subdir',
          'node_modules',
          '.git',
          'dist',
          '.skills',
        ] as unknown as fs.Dirent[];
      if (dirStr === '/mock/core/subdir') return ['file2.ts'] as unknown as fs.Dirent[];
      return [] as unknown as fs.Dirent[];
    }) as unknown as typeof fs.readdirSync);

    vi.mocked(fs.statSync).mockImplementation(((filePath: string) => {
      const pathStr = filePath;
      if (
        pathStr.endsWith('subdir') ||
        pathStr.endsWith('node_modules') ||
        pathStr.endsWith('dist') ||
        pathStr.endsWith('.git') ||
        pathStr.endsWith('.skills')
      ) {
        return { isDirectory: () => true } as fs.Stats;
      }
      return { isDirectory: () => false } as fs.Stats;
    }) as unknown as typeof fs.statSync);

    await explorer.discover();

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('modules-index.json'),
      expect.stringContaining('file1.ts'),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('modules-index.json'),
      expect.stringContaining('file2.ts'),
    );
    // Should not contain ignored directories or markers
    expect(fs.writeFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining('modules-index.json'),
      expect.stringContaining('node_modules'),
    );
    expect(fs.writeFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining('modules-index.json'),
      expect.stringContaining('.skills'),
    );
  });

  it('listFiles should return empty array for non-existent directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const explorer = new Explorer([], mockConfig, mockTmpDir);
    const results = (explorer as unknown as { listFiles: (p: string) => string[] }).listFiles(
      '/non-existent',
    );
    expect(results).toEqual([]);
  });
});
