import { BaseCommand } from '@nexical/cli-core';
import chalk from 'chalk';

class Logger {
  private command: BaseCommand | null = null;
  private debugEnabled: boolean = false;

  /**
   * Set the active command to delegate regular output to.
   */
  setCommand(command: any) {
    this.command = command;
  }

  /**
   * Toggle debug logging.
   */
  setDebug(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  /**
   * Log informational message.
   */
  info(message: string) {
    if (this.command) {
      this.command.info(message);
    } else {
      console.log(chalk.blue('ℹ'), message);
    }
  }

  /**
   * Log success message.
   */
  success(message: string) {
    if (this.command) {
      this.command.success(message);
    } else {
      console.log(chalk.green('✔'), message);
    }
  }

  /**
   * Log warning message.
   */
  warn(message: string) {
    if (this.command) {
      this.command.warn(message);
    } else {
      console.log(chalk.yellow('⚠'), message);
    }
  }

  /**
   * Log error message.
   */
  error(message: string) {
    if (this.command) {
      // NOTE: BaseCommand.error usually exits the process.
      this.command.error(message);
    } else {
      console.error(chalk.red('✖'), message);
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Log debug detail. ALWAYS goes to console.debug if debug is enabled.
   */
  debug(message: string, ...args: unknown[]) {
    if (this.debugEnabled) {
      const timestamp = new Date().toISOString();
      const prefix = chalk.gray(`[DEBUG ${timestamp}]`);
      console.debug(prefix, message, ...args);
    }
  }

  /**
   * Log notice message.
   */
  notice(message: string) {
    if (this.command && (this.command as any).notice) {
      (this.command as any).notice(message);
    } else {
      console.log(chalk.cyan('📢'), message);
    }
  }
}

export const logger = new Logger();
