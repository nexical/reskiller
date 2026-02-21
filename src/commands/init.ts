import { BaseCommand } from '@nexical/cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { logger } from '../core/Logger.js';

export default class InitCommand extends BaseCommand {
  static description = 'Initializes reskill configurations';
  static args = {
    args: [
      {
        name: 'directory',
        description: 'Optional directory to scope the initialization to',
        required: false,
      },
    ],
  };

  async run(options: { directory?: string } = {}) {
    logger.setCommand(this);
    logger.setDebug(this.globalOptions?.debug);

    const root = this.projectRoot || process.cwd();

    const defaultConfig = {
      constitution: {
        architecture: '.reskill/architecture.md',
      },
      discovery: {
        root: '.',
        ignore: ['node_modules', 'dist', '.git', '.reskill'],
        depth: 5,
      },
      outputs: {
        contextFiles: [],
      },
      ai: {
        provider: 'gemini-cli',
      },
    };

    if (options.directory) {
      const scopeDir = path.resolve(root, options.directory);
      if (!fs.existsSync(scopeDir)) {
        logger.info(`Creating directory ${path.relative(root, scopeDir)}`);
        fs.mkdirSync(scopeDir, { recursive: true });
      }

      const reskillerYamlPath = path.join(scopeDir, 'reskiller.yaml');
      if (fs.existsSync(reskillerYamlPath)) {
        logger.info(
          `Reskill configuration already exists at ${path.relative(root, reskillerYamlPath)}`,
        );
        return;
      }

      // We output a partial config for scoped directories
      const overrideConfig = {
        constitution: {
          architecture: '.reskill/architecture.md',
        },
      };

      fs.writeFileSync(reskillerYamlPath, yaml.stringify(overrideConfig));
      logger.success(`✅ Created ${path.relative(root, reskillerYamlPath)}`);
    } else {
      const nexicalYamlPath = path.join(root, 'nexical.yaml');
      const reskillerYamlPath = path.join(root, 'reskiller.yaml');

      if (fs.existsSync(nexicalYamlPath)) {
        const content = fs.readFileSync(nexicalYamlPath, 'utf-8');
        try {
          const doc = yaml.parseDocument(content);
          if (doc.has('reskill')) {
            logger.info(
              `Reskill configuration already exists in ${path.relative(root, nexicalYamlPath)}`,
            );
            return;
          }
          doc.set('reskill', defaultConfig);
          fs.writeFileSync(nexicalYamlPath, doc.toString());
          logger.success(
            `✅ Added reskill configuration to ${path.relative(root, nexicalYamlPath)}`,
          );
        } catch {
          const parsed = yaml.parse(content) || {};
          if (parsed.reskill) {
            logger.info(
              `Reskill configuration already exists in ${path.relative(root, nexicalYamlPath)}`,
            );
            return;
          }
          parsed.reskill = defaultConfig;
          fs.writeFileSync(nexicalYamlPath, yaml.stringify(parsed));
          logger.success(
            `✅ Added reskill configuration to ${path.relative(root, nexicalYamlPath)}`,
          );
        }
      } else {
        if (fs.existsSync(reskillerYamlPath)) {
          logger.info(
            `Reskill configuration already exists at ${path.relative(root, reskillerYamlPath)}`,
          );
          return;
        }

        fs.writeFileSync(reskillerYamlPath, yaml.stringify(defaultConfig));
        logger.success(`✅ Created ${path.relative(root, reskillerYamlPath)}`);
      }
    }
  }
}
