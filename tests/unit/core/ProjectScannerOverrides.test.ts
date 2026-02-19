import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectScanner } from '../../../src/core/ProjectScanner.js';
import * as fs from 'node:fs';
import fg from 'fast-glob';
import { ReskillConfig } from '../../../src/config.js';

vi.mock('node:fs');
vi.mock('fast-glob');

describe('ProjectScanner Overrides', () => {
  const mockConfig = {
    discovery: {
      root: '.',
      ignore: ['node_modules'],
      depth: 5,
    },
  };
  const mockCwd = '/home/adrian/Projects/nexical/registry';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should resolve overrides from reskiller.yaml in project path', async () => {
    vi.mocked(fg).mockResolvedValue(['/home/adrian/Projects/nexical/registry/packages/a/.skills']);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('reskiller.yaml')) {
        return p === '/home/adrian/Projects/nexical/registry/packages/a/reskiller.yaml';
      }
      return false;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === '/home/adrian/Projects/nexical/registry/packages/a/reskiller.yaml') {
        return 'constitution:\n  architecture: custom-arch.md';
      }
      return '';
    });

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects).toHaveLength(1);
    expect(projects[0].overrides).toBeDefined();
    expect(projects[0].overrides?.constitution?.architecture).toBe('custom-arch.md');
  });

  it('should inherit overrides from parent directories recursively', async () => {
    vi.mocked(fg).mockResolvedValue([
      '/home/adrian/Projects/nexical/registry/packages/deep/sub/project/.skills',
    ]);

    const reskillerA = '/home/adrian/Projects/nexical/registry/packages/deep/reskiller.yaml';
    const reskillerB =
      '/home/adrian/Projects/nexical/registry/packages/deep/sub/project/reskiller.yaml';

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p === reskillerA || p === reskillerB;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === reskillerA) {
        return 'constitution:\n  architecture: parent-arch.md\n  patterns: parent-pattern.md';
      }
      if (p === reskillerB) {
        return 'constitution:\n  architecture: child-arch.md';
      }
      return '';
    });

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    expect(projects).toHaveLength(1);
    expect(projects[0].overrides).toBeDefined();
    // Child overrides parent architecture
    expect(projects[0].overrides?.constitution?.architecture).toBe('child-arch.md');
    // Child inherits parent patterns
    expect(projects[0].overrides?.constitution?.patterns).toBe('parent-pattern.md');
  });

  it('should not inherit overrides from sibling directories', async () => {
    vi.mocked(fg).mockResolvedValue([
      '/home/adrian/Projects/nexical/registry/packages/a/.skills',
      '/home/adrian/Projects/nexical/registry/packages/b/.skills',
    ]);

    const reskillerA = '/home/adrian/Projects/nexical/registry/packages/a/reskiller.yaml';

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p === reskillerA;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === reskillerA) {
        return 'constitution:\n  architecture: arch-a.md';
      }
      return '';
    });

    const scanner = new ProjectScanner(mockConfig as unknown as ReskillConfig, mockCwd);
    const projects = await scanner.scan();

    const projectA = projects.find((p) => p.name === 'a');
    const projectB = projects.find((p) => p.name === 'b');

    expect(projectA?.overrides?.constitution?.architecture).toBe('arch-a.md');
    expect(projectB?.overrides).toBeUndefined();
  });
});
