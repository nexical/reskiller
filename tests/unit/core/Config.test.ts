import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getReskillConfig,
  mergeConfig,
  mergePartialConfigs,
  ReskillConfig,
} from '../../../src/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('node:fs');

describe('Config Loading', () => {
  const mockCliConfig = {
    someOtherKey: {},
  };
  const mockProjectRoot = '/mock/root';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should load config from root reskiller.yaml if not in nexical.yaml', () => {
    const reskillerPath = path.join(mockProjectRoot, 'reskiller.yaml');
    vi.mocked(fs.existsSync).mockImplementation((p) => p === reskillerPath);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === reskillerPath) {
        return `
constitution:
  architecture: arch.md
outputs:
  contextFiles: ["GEMINI.md"]
`;
      }
      return '';
    });

    const config = getReskillConfig(mockCliConfig, mockProjectRoot);
    expect(config.constitution.architecture).toBe('arch.md');
    expect(config.outputs.contextFiles).toContain('GEMINI.md');
  });

  it('should prefer nexical.yaml over reskiller.yaml', () => {
    const cliConfig = {
      reskill: {
        constitution: { architecture: 'nexical.md' },
        outputs: { contextFiles: ['NEXICAL.md'] },
      },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true); // Both exist
    vi.mocked(fs.readFileSync).mockReturnValue('constitution:\n  architecture: reskiller.md');

    const config = getReskillConfig(cliConfig, mockProjectRoot);
    expect(config.constitution.architecture).toBe('nexical.md');
  });

  it('should throw error if no config found anywhere', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => getReskillConfig(mockCliConfig, mockProjectRoot)).toThrow(
      'Reskill configuration not found in nexical.yaml or root reskiller.yaml.',
    );
  });

  describe('Merging', () => {
    const globalConfig = {
      constitution: { architecture: 'global.md', patterns: 'global-p.md' },
      discovery: { root: '.', ignore: ['node_modules'], depth: 5 },
      outputs: { contextFiles: ['G.md'], symlinks: [] },
    };

    it('should merge partial overrides into global config', () => {
      const overrides = {
        constitution: { architecture: 'overridden.md' },
      };
      const merged = mergeConfig(globalConfig as ReskillConfig, overrides);
      expect(merged.constitution.architecture).toBe('overridden.md');
      expect(merged.constitution.patterns).toBe('global-p.md');
    });

    it('should merge multiple partial configs', () => {
      const partial1 = { constitution: { architecture: 'p1.md' } };
      const partial2 = { constitution: { patterns: ['p2.md'] } };
      const merged = mergePartialConfigs(partial1, partial2);
      expect(merged.constitution?.architecture).toBe('p1.md');
      expect(merged.constitution?.patterns).toEqual(['p2.md']);
    });
  });
});
