import { describe, it, expect } from 'vitest';
import { getReskillConfig, parseReskillerConfig, mergeConfig } from '../../src/config.js';
import type { ReskillConfig, ReskillConfigOverrides } from '../../src/config.js';
import * as fs from 'node:fs';
import { vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

describe('config', () => {
  it('should extract valid configuration from global config', () => {
    const globalConfig = {
      reskill: {
        constitution: { architecture: 'Arch' },
        discovery: {
          root: '.',
          ignore: ['node_modules'],
          depth: 5,
        },
        outputs: {
          contextFiles: ['ctx.md'],
          symlinks: [],
        },
      },
    };

    const config = getReskillConfig(globalConfig);
    expect(config).toEqual(expect.objectContaining(globalConfig.reskill));
    expect(config.outputs.symlinks).toEqual([]);
  });

  it('should throw if reskill key is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    const globalConfig = {};
    expect(() => getReskillConfig(globalConfig)).toThrow(
      'Reskill configuration not found in nexical.yaml',
    );
  });

  it('should use default values where applicable', () => {
    const minimalConfig = {
      reskill: {
        constitution: { architecture: 'Arch' },
        outputs: {
          contextFiles: [],
        },
      },
    };

    const config = getReskillConfig(minimalConfig);
    expect(config.discovery.root).toBe('.');
  });

  it('should support multiple patterns in constitution', () => {
    const configWithArray = {
      reskill: {
        constitution: {
          architecture: 'Arch',
          patterns: ['P1', 'P2'],
        },
        outputs: {
          contextFiles: [],
        },
      },
    };

    const config = getReskillConfig(configWithArray);
    expect(config.constitution.patterns).toEqual(['P1', 'P2']);
  });

  it('should parse partial reskiller.yaml content', () => {
    const yamlContent = `
constitution:
  architecture: NewArch
discovery:
  depth: 10
`;
    const overrides = parseReskillerConfig(yamlContent);
    expect(overrides.constitution?.architecture).toBe('NewArch');
    expect(overrides.discovery?.depth).toBe(10);
    expect(overrides.constitution?.patterns).toBeUndefined();
  });

  it('should merge deep partial overrides correctly', () => {
    const globalConfig: ReskillConfig = {
      constitution: { architecture: 'BaseArch', patterns: 'P1' },
      discovery: { root: '.', ignore: [], depth: 5 },
      outputs: { contextFiles: ['ctx.md'], symlinks: [] },
    };

    const overrides: ReskillConfigOverrides = {
      constitution: { architecture: 'OverriddenArch' },
      discovery: { depth: 10 },
    };

    const merged = mergeConfig(globalConfig, overrides);
    expect(merged.constitution.architecture).toBe('OverriddenArch');
    expect(merged.constitution.patterns).toBe('P1');
    expect(merged.discovery.depth).toBe(10);
    expect(merged.discovery.root).toBe('.');
    expect(merged.outputs.contextFiles).toEqual(['ctx.md']);
  });
});
