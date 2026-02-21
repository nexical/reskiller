import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../../src/core/Logger.js';
import { BaseCommand } from '@nexical/cli-core';

describe('Logger', () => {
  let mockCommand: {
    info: (msg: string) => void;
    success: (msg: string) => void;
    error: (msg: string) => void;
    warn: (msg: string) => void;
    notice: (msg: string) => void;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockCommand = {
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      notice: vi.fn(),
    };
    logger.setCommand(null);
    logger.setDebug(false);
  });

  it('should log to console when no command is set', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.info('info');
    expect(logSpy).toHaveBeenCalledWith(expect.any(String), 'info');

    logger.success('success');
    expect(logSpy).toHaveBeenCalledWith(expect.any(String), 'success');

    logger.warn('warn');
    expect(logSpy).toHaveBeenCalledWith(expect.any(String), 'warn');

    logger.error('error');
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), 'error');

    logger.notice('notice');
    expect(logSpy).toHaveBeenCalledWith(expect.any(String), 'notice');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should delegate to command when set', () => {
    logger.setCommand(mockCommand as unknown as BaseCommand);

    logger.info('info');
    expect(mockCommand.info).toHaveBeenCalledWith('info');

    logger.success('success');
    expect(mockCommand.success).toHaveBeenCalledWith('success');

    logger.warn('warn');
    expect(mockCommand.warn).toHaveBeenCalledWith('warn');

    logger.error('error');
    expect(mockCommand.error).toHaveBeenCalledWith('error');

    logger.notice('notice');
    expect(mockCommand.notice).toHaveBeenCalledWith('notice');
  });

  it('should log debug messages only when debug is enabled', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logger.debug('debug hidden');
    expect(debugSpy).not.toHaveBeenCalled();

    logger.setDebug(true);
    logger.debug('debug message');
    expect(debugSpy).toHaveBeenCalledWith(expect.any(String), 'debug message', ...[]);

    debugSpy.mockRestore();
  });

  it('should fallback to console for notice if command does not support it', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const incompleteCommand = { info: vi.fn() };
    logger.setCommand(incompleteCommand as unknown as BaseCommand);

    logger.notice('notice fallback');
    expect(logSpy).toHaveBeenCalledWith(expect.any(String), 'notice fallback');

    logSpy.mockRestore();
  });

  it('should exit process on error when not in test env', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;

    (process.env as unknown as { NODE_ENV: string }).NODE_ENV = 'production';

    expect(() => logger.error('Fatal')).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);

    // Restore
    (process.env as unknown as { NODE_ENV: string | undefined }).NODE_ENV = originalEnv;
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
