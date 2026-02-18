import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectScanner } from '../../../src/core/ProjectScanner.js';
import * as fs from 'node:fs';
import fg from 'fast-glob';
import { ReskillConfig } from '../../../src/config.js';

vi.mock('node:fs');
vi.mock('fast-glob');

describe('ProjectScanner', () => {
  const mockConfig = {
    discovery: {
      root: '.',
      markers: ['.skills'],
      ignore: ['node_modules'],
      depth: 5,
    },
  };
  const mockCwd = '/mock/cwd';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should find projects with .skills markers', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/core/.skills', '/mock/cwd/packages/a/.skills']);

    vi.mocked(fs.existsSync).mockReturnValue(false); // No package.json

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe('a');
    expect(projects[1].name).toBe('core');
  });

  it('should use package.json name if available', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);

    vi.mocked(fs.existsSync).mockImplementation((p) => (p as string).endsWith('package.json'));
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'custom-name' }));

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects[0].name).toBe('custom-name');
  });

  it('should fallback to dir name if package.json has no name', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0.0' })); // No name

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects[0].name).toBe('a');
  });

  it('should handle package.json parsing errors', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/b/.skills']);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Invalid JSON');
    });

    // Spy on console.warn
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects[0].name).toBe('b');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse package.json'));

    warnSpy.mockRestore();
  });

  it('should handle multiple markers', async () => {
    const multiMarkerConfig = {
      discovery: {
        ...mockConfig.discovery,
        markers: ['.skills', 'skills'],
      },
    };

    vi.mocked(fg)
      .mockResolvedValueOnce(['/mock/cwd/a/.skills'])
      .mockResolvedValueOnce(['/mock/cwd/b/skills']);

    const scanner = new ProjectScanner(multiMarkerConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects).toHaveLength(2);
    expect(projects.map((p) => p.name)).toContain('a');
    expect(projects.map((p) => p.name)).toContain('b');
  });

  it('should ignore duplicate project paths', async () => {
    vi.mocked(fg).mockResolvedValue([
      '/mock/cwd/packages/a/.skills',
      '/mock/cwd/packages/a/sub/.skills', // This resolves to same project dir /mock/cwd/packages/a if we logic it right?
      // Wait, resolveProject uses path.dirname(skillDirPath).
      // So '/mock/cwd/packages/a/.skills' -> '/mock/cwd/packages/a'
      // And '/mock/cwd/packages/a/sub/.skills' -> '/mock/cwd/packages/a/sub'
      // These are different.

      // To trigger seenPaths.has(projectPath), we need TWO skill dirs in the SAME project dir?
      // Or same skill dir returned twice?
      // fg usually returns unique paths.

      // Use two markers resolving to same place?
    ]);

    // Let's use multiple markers finding the same file
    const multiMarkerConfig = {
      discovery: {
        ...mockConfig.discovery,
        markers: ['.skills', '.skills'], // Duplicate marker to trigger double scan?
      },
    };
    // The code iterates over markers.
    // loops marker 1 -> finds X
    // loops marker 2 -> finds X again

    vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);

    const scanner = new ProjectScanner(multiMarkerConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects).toHaveLength(1);
  });
});
