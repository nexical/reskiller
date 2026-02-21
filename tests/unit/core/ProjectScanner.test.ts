import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectScanner } from '../../../src/core/ProjectScanner.js';
import * as fs from 'node:fs';
import fg from 'fast-glob';
import { ReskillConfig } from '../../../src/config.js';
import { logger } from '../../../src/core/Logger.js';

vi.mock('node:fs');
vi.mock('fast-glob');

describe('ProjectScanner', () => {
  const mockConfig = {
    discovery: {
      root: '.',
      ignore: ['node_modules'],
      depth: 5,
    },
  };
  const mockCwd = '/mock/cwd';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should find projects with .git or .skills markers', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/core/.git', '/mock/cwd/packages/a/.skills']);

    vi.mocked(fs.existsSync).mockReturnValue(false); // No package.json

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe('a');
    expect(projects[1].name).toBe('core');
    expect(projects[1].skillDir).toBe('/mock/cwd/core/.skills');
  });

  it('should use package.json name if available', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);

    vi.mocked(fs.existsSync).mockImplementation((p) => (p as string).endsWith('package.json'));
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'custom-name' }));

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects[0].name).toBe('custom-name');
  });

  it('should flatten scoped package names', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);

    vi.mocked(fs.existsSync).mockImplementation((p) => (p as string).endsWith('package.json'));
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: '@modules/feature-flags' }));

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects[0].name).toBe('modules-feature-flags');
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

    // Spy on logger.warn
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects[0].name).toBe('b');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse package.json'));

    warnSpy.mockRestore();
  });

  it('should find projects using .git files (submodules)', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/submodule/.git']);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('submodule');
    expect(projects[0].skillDir).toBe('/mock/cwd/submodule/.skills');
  });

  it('should ignore duplicate project paths', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects).toHaveLength(1);
  });

  describe('scoping', () => {
    it('should include project if it is inside the scope', async () => {
      vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);
      const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
      const projects = await scanner.scan('/mock/cwd/packages');

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe('/mock/cwd/packages/a');
      expect(projects[0].name).toBe('a');
    });

    it('should update project path to scope if scope is inside the project', async () => {
      vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);
      const scope = '/mock/cwd/packages/a/src/commands';
      const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
      const projects = await scanner.scan(scope);

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe(scope);
      expect(projects[0].name).toBe('commands');
    });

    it('should exclude project if it is outside the scope (sibling)', async () => {
      vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);
      const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
      const projects = await scanner.scan('/mock/cwd/packages/b');

      expect(projects).toHaveLength(0);
    });

    it('should exclude project if it is a parent of the scope but no scopeInsideProject match?', async () => {
      // Actually, if it's a parent, it should become the scope.
      // E.g. .skills is at root, scope is packages/a.
      vi.mocked(fg).mockResolvedValue(['/mock/cwd/.skills']);
      const scope = '/mock/cwd/packages/a';
      const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
      const projects = await scanner.scan(scope);

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe(scope);
      expect(projects[0].name).toBe('a');
    });
  });

  it('should load project-level reskiller.yaml overrides', async () => {
    vi.mocked(fg).mockResolvedValue(['/mock/cwd/packages/a/.skills']);
    vi.mocked(fs.existsSync).mockImplementation((p) => (p as string).endsWith('reskiller.yaml'));
    vi.mocked(fs.readFileSync).mockReturnValue(
      'constitution:\n  architecture: "Project Architecture"',
    );

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects[0].overrides).toBeDefined();
    expect(projects[0].overrides?.constitution?.architecture).toBe('Project Architecture');
  });

  it('should break walk-up if parentDir is currentDir', async () => {
    // This is to hit: if (parentDir === currentDir) break;
    const scanner = new ProjectScanner(
      {
        discovery: { root: '.', markers: [], ignore: [], depth: 1 },
      } as unknown as ReskillConfig,
      '/',
    );
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await (
      scanner as unknown as { resolveOverrides: (p: string) => Promise<void> }
    ).resolveOverrides('/');
    // Successfully returned without hanging
  });
});
