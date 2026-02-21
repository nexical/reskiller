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
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.info('info');
    expect(infoSpy).toHaveBeenCalledWith(expect.any(String), 'info');

    logger.success('success');
    expect(infoSpy).toHaveBeenCalledWith(expect.any(String), 'success');

    logger.warn('warn');
    expect(warnSpy).toHaveBeenCalledWith(expect.any(String), 'warn');

    logger.error('error');
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), 'error');

    logger.notice('notice');
    expect(infoSpy).toHaveBeenCalledWith(expect.any(String), 'notice');

    infoSpy.mockRestore();
    warnSpy.mockRestore();
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
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.debug('debug hidden');
    expect(infoSpy).not.toHaveBeenCalled();

    logger.setDebug(true);
    logger.debug('debug message');
    expect(infoSpy).toHaveBeenCalledWith(expect.any(String), 'debug message', ...[]);

    infoSpy.mockRestore();
  });

  it('should fallback to console for notice if command does not support it', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const incompleteCommand = { info: vi.fn() };
    logger.setCommand(incompleteCommand as unknown as BaseCommand);

    logger.notice('notice fallback');
    expect(infoSpy).toHaveBeenCalledWith(expect.any(String), 'notice fallback');

    infoSpy.mockRestore();
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
