import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from '../../../src/agents/AgentRunner.js'; // Ensure we are testing the actual class
import { execSync } from 'node:child_process';

vi.mock('node:child_process');

describe('AgentRunner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should construct command and execute it', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    AgentRunner.run('TestAgent', 'path/to/prompt.md', {
      foo: 'bar',
      nested: { key: 'value' },
    });

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('npx prompt path/to/prompt.md'),
      expect.objectContaining({ stdio: 'inherit' }),
    );
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--foo "bar"'),
      expect.any(Object),
    );
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--nested.key "value"'),
      expect.any(Object),
    );

    consoleSpy.mockRestore();
  });

  it('should throw error if execution fails', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed');
    });

    expect(() => AgentRunner.run('TestAgent', 'path', {})).toThrow(
      'Agent TestAgent failed execution: Command failed',
    );

    consoleSpy.mockRestore();
  });

  it('should handle non-Error objects thrown', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(execSync).mockImplementation(() => {
      throw 'String error';
    });

    expect(() => AgentRunner.run('TestAgent', 'path', {})).toThrow(
      'Agent TestAgent failed execution: String error',
    );

    consoleSpy.mockRestore();
  });
});
