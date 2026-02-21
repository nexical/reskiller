import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Import AFTER mocking
import { Initializer } from '../../../src/core/Initializer.js';
import { ReskillConfig } from '../../../src/config.js';

vi.mock('node:fs');

describe('Initializer', () => {
  const mockConfig = {
    outputs: { symlinks: [] },
  } as unknown as ReskillConfig;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.cpSync).mockImplementation(() => {});
    vi.mocked(fs.rmSync).mockImplementation(() => {});
    vi.mocked(fs.renameSync).mockImplementation(() => {});
    vi.mocked(fs.rmdirSync).mockImplementation(() => {});
    vi.mocked(fs.readdirSync).mockReturnValue([]);
  });

  const mockRootDir = '/mock/root';

  it('should create prompts directory if missing', () => {
    Initializer.initialize(mockConfig, mockRootDir);
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.resolve(mockRootDir, '.reskiller/prompts'), {
      recursive: true,
    });
  });

  it('should copy prompts if source exists and target is empty', () => {
    // Mock source prompts exist
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString().endsWith('prompts') && !p.toString().includes('.reskiller'),
    );
    // Mock target is empty (readdir returns [])
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    Initializer.initialize(mockConfig, mockRootDir);

    expect(fs.cpSync).toHaveBeenCalledWith(
      expect.stringContaining('prompts'),
      path.resolve(mockRootDir, '.reskiller/prompts'),
      { recursive: true },
    );
  });

  it('should cleanup legacy agents directory if exists', () => {
    const legacyAgentsDir = path.resolve(mockRootDir, '.reskiller/prompts/agents');
    vi.mocked(fs.existsSync).mockImplementation((p) => p.toString() === legacyAgentsDir);

    Initializer.initialize(mockConfig, mockRootDir);

    expect(fs.rmSync).toHaveBeenCalledWith(legacyAgentsDir, { recursive: true, force: true });
  });

  it('should call ensureSymlinks', () => {
    const ensureSymlinksMock = vi.fn();
    Initializer.initialize(mockConfig, mockRootDir, ensureSymlinksMock);
    expect(ensureSymlinksMock).toHaveBeenCalledWith(mockConfig);
  });

  it('should skip copying if target is NOT empty', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // @ts-expect-error - mock return type mismatch
    vi.mocked(fs.readdirSync).mockReturnValue(['existing-file'] as unknown as fs.Dirent[]);

    Initializer.initialize(mockConfig, mockRootDir);

    expect(fs.cpSync).not.toHaveBeenCalled();
  });

  it('should do nothing if source prompts do not exist', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p.toString().includes('.reskiller')); // Only target exists
    Initializer.initialize(mockConfig, mockRootDir);
    expect(fs.cpSync).not.toHaveBeenCalled();
  });
});
