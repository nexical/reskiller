import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Architect } from '../../../src/core/Architect.js';
import { AgentRunner } from '../../../src/agents/AgentRunner.js';
import * as fs from 'node:fs';

vi.mock('node:fs');
vi.mock('../../../src/agents/AgentRunner.js');

describe('Architect', () => {
  const mockSkillsDir = '/mock/skills';
  const mockTmpDir = '/mock/tmp';
  const mockGraphPath = '/mock/graph.json';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as fs.Dirent[]);
  });

  it('should instantiate correctly', () => {
    const architect = new Architect(mockSkillsDir, mockTmpDir);
    expect(architect).toBeDefined();
  });

  it('should strategize and return a plan', async () => {
    const architect = new Architect(mockSkillsDir, mockTmpDir);
    const mockPlan = { plan: ['skill1'] };

    // Mock readdirSync withFileTypes result
    vi.mocked(fs.readdirSync).mockImplementation(((
      dir: string,
      opts: { withFileTypes?: boolean },
    ) => {
      if (dir === mockSkillsDir && opts?.withFileTypes) {
        return [{ name: 'existing-skill', isDirectory: () => true }] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    }) as unknown as typeof fs.readdirSync);

    vi.mocked(fs.existsSync).mockReturnValue(true); // Output file exists
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPlan));

    const result = await architect.strategize(mockGraphPath);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('current-skills.json'),
      expect.stringContaining('existing-skill'),
    );
    expect(AgentRunner.run).toHaveBeenCalledWith(
      'Architect',
      'agents/architect.md',
      expect.objectContaining({
        knowledge_graph_file: mockGraphPath,
      }),
    );
    expect(result).toEqual(mockPlan);
  });

  it('should return empty plan if output file not found', async () => {
    const architect = new Architect(mockSkillsDir, mockTmpDir);

    vi.mocked(fs.existsSync).mockImplementation(((p: string) => {
      if (p.endsWith('skill-plan.json')) return false;
      return true;
    }) as unknown as typeof fs.existsSync);

    const result = await architect.strategize(mockGraphPath);
    expect(result).toEqual({ plan: [] });
  });

  it('should handle missing skills directory gracefully', async () => {
    const architect = new Architect(mockSkillsDir, mockTmpDir);

    vi.mocked(fs.existsSync).mockReturnValue(false); // skills dir missing

    await architect.strategize(mockGraphPath);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('current-skills.json'),
      '[]', // Empty list
    );
  });

  it('should filter out non-directories in listSkills', async () => {
    const architect = new Architect(mockSkillsDir, mockTmpDir);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(((
      dir: string,
      opts: { withFileTypes?: boolean },
    ) => {
      if (dir === mockSkillsDir && opts?.withFileTypes) {
        return [
          { name: 'good-skill', isDirectory: () => true },
          { name: 'README.md', isDirectory: () => false },
        ] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    }) as unknown as typeof fs.readdirSync);

    await architect.strategize(mockGraphPath);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('current-skills.json'),
      expect.stringContaining('good-skill'),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('current-skills.json'),
      expect.not.stringContaining('README.md'),
    );
  });
});
