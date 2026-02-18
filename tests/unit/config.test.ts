import { describe, it, expect } from 'vitest';
import { getReskillConfig } from '../../src/config.js';

describe('config', () => {
  it('should extract valid configuration from global config', () => {
    const globalConfig = {
      reskill: {
        skillsDir: 'custom-skills',
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
    expect(config.skillsDir).toBe('skills');
    expect(config.discovery.root).toBe('.');
  });
});
