import { vi } from 'vitest';

export const ensureTmpDir = vi.fn();
export const stageAuditor = vi.fn().mockReturnValue('canon.md');
export const stageCritic = vi.fn().mockReturnValue('drift.md');
export const stageInstructor = vi.fn();
export const updateContextFiles = vi.fn();
