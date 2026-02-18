import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRunner } from '../../../src/agents/AgentRunner.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

describe('AgentRunner Integration', () => {
  const tmpDir = path.join(os.tmpdir(), `reskill-integration-${Date.now()}`);

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    vi.resetAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should execute Auditor agent and trigger Gemini', async () => {
    // 1. Mock Gemini response
    const mockOutput = 'Model response';
    const mockChild = {
      stdout: {
        on: vi.fn((event, cb) => {
          if (event === 'data') cb(Buffer.from(mockOutput));
        }),
      },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

    const outputFile = path.join(tmpDir, 'canon.json');

    // 2. Run AgentRunner
    // We use a real prompt file from the package: prompts/agents/auditor.md
    await AgentRunner.run('Auditor', 'agents/auditor.md', {
      module_path: 'src',
      output_file: outputFile,
      constitution: { architecture: 'SPEC.md' },
    });

    // 3. Verify
    expect(spawn).toHaveBeenCalled();
    const spawnCall = vi.mocked(spawn).mock.calls[0];
    expect(spawnCall[0]).toContain('gemini --yolo --model');
  });
});
