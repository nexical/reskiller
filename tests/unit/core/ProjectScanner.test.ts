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
});
