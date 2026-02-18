import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ensureTmpDir,
  stageAuditor,
  stageCritic,
  stageInstructor,
  updateContextFiles,
} from '../../../src/core/Pipeline.js';
import { AgentRunner } from '../../../src/agents/AgentRunner.js';
import { logger } from '../../../src/core/Logger.js';
import * as fs from 'node:fs';
import { ReskillConfig } from '../../../src/config.js';

vi.mock('node:fs');
vi.mock('../../../src/agents/AgentRunner.js');

describe('Pipeline', () => {
  const mockConfig = {
    skillsDir: '/mock/skills',
    outputs: {
      contextFiles: ['/mock/context.md'],
    },
    constitution: { architecture: 'Test' },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
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

    it('stageAuditor should call AgentRunner', async () => {
      const result = await stageAuditor(target, mockConfig as unknown as ReskillConfig);
      expect(AgentRunner.run).toHaveBeenCalledWith(
        'Auditor',
        'agents/auditor.md',
        expect.any(Object),
      );
      expect(result).toContain('Test-Skill-canon.json');
    });

    it('stageCritic should call AgentRunner', async () => {
      await stageCritic(target, 'canon.json', mockConfig as unknown as ReskillConfig);
      expect(AgentRunner.run).toHaveBeenCalledWith(
        'Critic',
        'agents/critic.md',
        expect.any(Object),
      );
    });

    it('stageInstructor should call AgentRunner', async () => {
      await stageInstructor(
        target,
        'canon.json',
        'drift.md',
        mockConfig as unknown as ReskillConfig,
      );
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
      vi.mocked(fs.readdirSync).mockImplementation(((dir: string) => {
        if (dir === mockConfig.skillsDir) return ['skill1'];
        return [];
      }) as unknown as typeof fs.readdirSync);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((p: string | Buffer | URL) => {
        const pathStr = p.toString();
        if (pathStr.endsWith('SKILL.md')) return 'description: Test Skill Description';
        if (pathStr.endsWith('context.md')) return 'Old Content';
        return '';
      }) as unknown as typeof fs.readFileSync);

      await updateContextFiles(mockConfig as unknown as ReskillConfig);

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
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((p: string | Buffer | URL) => {
        if (p.toString().endsWith('context.md')) return 'Pre <skills>old</skills> Post';
        return '';
      }) as unknown as typeof fs.readFileSync);

      await updateContextFiles(mockConfig as unknown as ReskillConfig);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/context.md',
        expect.stringMatching(/Pre <skills>[\s\S]*<\/skills> Post/),
        'utf-8',
      );
    });

    it('should handle legacy section', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((p: string | Buffer | URL) => {
        if (p.toString().endsWith('context.md')) return 'Pre \n## 6. Skill Index\nOld\n## 7. Next';
        return '';
      }) as unknown as typeof fs.readFileSync);

      await updateContextFiles(mockConfig as unknown as ReskillConfig);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/context.md',
        expect.stringContaining('## 6. Skill Index'),
        'utf-8',
      );
    });

    it('should warn if context file missing', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockReturnValue(false); // No context file

      await updateContextFiles(mockConfig as unknown as ReskillConfig);

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
