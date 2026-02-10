import { describe, it, expect, vi } from 'vitest';
import { hooks } from '../../../src/core/Hooks.js';

describe('Hooks', () => {
  it('should execute onDriftDetected without error', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    await hooks.onDriftDetected({ name: 'test', type: 'module', path: '/path' }, 'drift.diff');
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Drift detected'));
    debugSpy.mockRestore();
  });

  it('should execute onSkillUpdated without error', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    await hooks.onSkillUpdated({ name: 'test', type: 'module', path: '/path' });
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Skill test updated'));
    debugSpy.mockRestore();
  });
});
