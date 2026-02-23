import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from '../../../src/agents/AgentRunner.js';
import { PromptRunner } from '@nexical/ai';

vi.mock('@nexical/ai');

describe('AgentRunner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call PromptRunner.run with correct arguments', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(PromptRunner.run).mockResolvedValue(0);

    const cwd = process.cwd();
    await AgentRunner.run('TestAgent', 'path/to/prompt.md', {
      foo: 'bar',
      nested: { key: 'value' },
      cwd,
    });

    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        promptName: 'path/to/prompt.md',
        args: expect.objectContaining({ foo: 'bar' }),
      }),
    );

    consoleSpy.mockRestore();
  });

  it('should throw error if execution fails (exit code !== 0)', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(PromptRunner.run).mockResolvedValue(1);

    await expect(AgentRunner.run('TestAgent', 'path', {})).rejects.toThrow(
      'Agent TestAgent failed execution: Execution failed with code 1',
    );

    consoleSpy.mockRestore();
  });

  it('should handle non-Error objects thrown', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(PromptRunner.run).mockRejectedValue('String error');

    await expect(AgentRunner.run('TestAgent', 'path', {})).rejects.toThrow(
      'Agent TestAgent failed execution: String error',
    );

    consoleSpy.mockRestore();
  });
});
