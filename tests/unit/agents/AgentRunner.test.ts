import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from '../../../src/agents/AgentRunner.js';
import { PromptRunner } from '../../../src/agents/PromptRunner.js';

vi.mock('../../../src/agents/PromptRunner.js');

describe('AgentRunner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call PromptRunner.run with correct arguments', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await AgentRunner.run('TestAgent', 'path/to/prompt.md', {
      foo: 'bar',
      nested: { key: 'value' },
    });

    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        promptName: 'path/to/prompt.md',
        foo: 'bar',
        nested: { key: 'value' },
      }),
    );

    consoleSpy.mockRestore();
  });

  it('should throw error if execution fails', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(PromptRunner.run).mockRejectedValue(new Error('Command failed'));

    await expect(AgentRunner.run('TestAgent', 'path', {})).rejects.toThrow(
      'Agent TestAgent failed execution: Command failed',
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
