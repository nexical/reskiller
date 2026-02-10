import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ensureTmpDir,
  stageAuditor,
  stageCritic,
  stageInstructor,
  updateContextFiles,
} from '../../../src/core/Pipeline.js';
import { AgentRunner } from '../../../src/agents/AgentRunner.js';
import * as fs from 'node:fs';

vi.mock('node:fs');
vi.mock('../../../src/agents/AgentRunner.js');

describe('Pipeline', () => {
  const mockConfig = {
    skillsDir: '/mock/skills',
    outputs: {
      contextFiles: ['/mock/context.md'],
    },
    constitution: {},
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => ({}) as any);
    vi.mocked(fs.unlinkSync).mockImplementation(() => {});
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.readdirSync).mockReturnValue([]);
  });

  describe('ensureTmpDir', () => {
    it('should create tmp dir if not exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      ensureTmpDir();
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.agent/tmp/reskill'), {
        recursive: true,
      });
    });
  });

  describe('Stage wrappers', () => {
    const target = { name: 'Test Skill', skillPath: '/skill/path', truthPath: '/truth/path' };

    it('stageAuditor should call AgentRunner', () => {
      const result = stageAuditor(target, mockConfig as any);
      expect(AgentRunner.run).toHaveBeenCalledWith(
        'Auditor',
        'agents/auditor.md',
        expect.any(Object),
      );
      expect(result).toContain('Test-Skill-canon.json');
    });

    it('stageCritic should call AgentRunner', () => {
      stageCritic(target, 'canon.json', mockConfig as any);
      expect(AgentRunner.run).toHaveBeenCalledWith(
        'Critic',
        'agents/critic.md',
        expect.any(Object),
      );
    });

    it('stageInstructor should call AgentRunner', () => {
      stageInstructor(target, 'canon.json', 'drift.md', mockConfig as any);
      expect(AgentRunner.run).toHaveBeenCalledWith(
        'Instructor',
        'agents/instructor.md',
        expect.any(Object),
      );
    });
  });

  describe('updateContextFiles', () => {
    it('should update context files with skill index', async () => {
      // Mock readdirSync for skills
      vi.mocked(fs.readdirSync).mockImplementation(((dir: unknown) => {
        if ((dir as string) === mockConfig.skillsDir) return ['skill1'];
        return [];
      }) as unknown as (path: fs.PathLike) => any);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
        const pathStr = p as string;
        if (pathStr.endsWith('SKILL.md')) return 'description: Test Skill Description';
        if (pathStr.endsWith('context.md')) return 'Old Content';
        return '';
      }) as unknown as (path: fs.PathLike | number) => any);

      await updateContextFiles(mockConfig as any);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/context.md',
        expect.stringContaining('<skills>'),
        'utf-8',
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/context.md',
        expect.stringContaining('Test Skill Description'),
        'utf-8',
      );
    });

    it('should replace existing <skills> block', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
        if ((p as string).endsWith('context.md')) return 'Pre <skills>old</skills> Post';
        return '';
      }) as unknown as (path: fs.PathLike | number) => any);

      await updateContextFiles(mockConfig as any);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/context.md',
        expect.stringMatching(/Pre <skills>[\s\S]*<\/skills> Post/),
        'utf-8',
      );
    });

    it('should handle legacy section', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
        if ((p as string).endsWith('context.md')) return 'Pre \n## 6. Skill Index\nOld\n## 7. Next';
        return '';
      }) as unknown as (path: fs.PathLike | number) => any);

      await updateContextFiles(mockConfig as any);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/context.md',
        expect.stringContaining('## 6. Skill Index'),
        'utf-8',
      );
    });

    it('should warn if context file missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockReturnValue(false); // No context file

      await updateContextFiles(mockConfig as any);

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
