import { describe, it, expect, vi } from 'vitest';
import { hooks } from '../../../src/core/Hooks.js';
import { logger } from '../../../src/core/Logger.js';

describe('Hooks', () => {
  it('should execute onDriftDetected without error', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    await hooks.onDriftDetected(
      { name: 'test', skillPath: '/skill', truthPath: '/truth' },
      'drift.diff',
    );
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Drift detected'));
    debugSpy.mockRestore();
  });

  it('should execute onSkillUpdated without error', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    await hooks.onSkillUpdated({ name: 'test', skillPath: '/skill', truthPath: '/truth' });
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Skill test updated'));
    debugSpy.mockRestore();
  });
});
