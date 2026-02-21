import { BaseCommand } from '@nexical/cli-core';
import { logger } from '../../core/Logger.js';

export default class NewCommand extends BaseCommand {
  static description = '{{DESCRIPTION}}';

  static args = {
    args: [
      // { name: 'argName', description: 'desc', required: true }
    ],
    options: [
      // { name: '--flag', description: 'desc', default: false }
    ],
  };

  async run(options: { [key: string]: unknown }) {
    logger.setCommand(this);

    // TODO: Implement command logic
    this.success('Command executed');
  }
}
