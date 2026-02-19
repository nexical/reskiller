import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';

export const ReskillConfigSchema = z.object({
  constitution: z.object({
    architecture: z.string(),
    patterns: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  discovery: z
    .object({
      root: z.string().default('.'),
      ignore: z.array(z.string()).default(['node_modules', 'dist', '.git']),
      depth: z.number().default(5),
    })
    .default({}),
  licenseKey: z.string().optional(),
  outputs: z.object({
    contextFiles: z.array(z.string()),
    symlinks: z.array(z.string()).optional().default([]),
  }),
});

export type ReskillConfig = z.infer<typeof ReskillConfigSchema>;
export type ReskillConfigOverrides = z.infer<ReturnType<typeof ReskillConfigSchema.deepPartial>>;

export function getReskillConfig(
  cliConfig: Record<string, unknown>,
  projectRoot: string = process.cwd(),
): ReskillConfig {
  let reskillConfig = cliConfig?.reskill;

  if (!reskillConfig) {
    // Look for root-level reskiller.yaml
    const reskillerYamlPath = path.join(projectRoot, 'reskiller.yaml');
    if (fs.existsSync(reskillerYamlPath)) {
      try {
        const content = fs.readFileSync(reskillerYamlPath, 'utf-8');
        reskillConfig = yaml.parse(content);
      } catch (e) {
        throw new Error(`Failed to parse reskiller.yaml at ${reskillerYamlPath}: ${e}`);
      }
    }
  }

  if (!reskillConfig) {
    throw new Error('Reskill configuration not found in nexical.yaml or root reskiller.yaml.');
  }

  return ReskillConfigSchema.parse(reskillConfig);
}

/**
 * Parses a reskiller.yaml file content into a partial configuration.
 */
export function parseReskillerConfig(content: string): ReskillConfigOverrides {
  const parsed = yaml.parse(content);
  // We use a relaxed validation for overrides
  return parsed as ReskillConfigOverrides;
}

/**
 * Merges a global configuration with project-specific overrides.
 */
export function mergeConfig(
  global: ReskillConfig,
  overrides?: ReskillConfigOverrides,
): ReskillConfig {
  if (!overrides) return global;

  const merged: ReskillConfig = {
    ...global,
    ...overrides,
    constitution: {
      ...global.constitution,
      ...(overrides.constitution || {}),
    } as ReskillConfig['constitution'],
    discovery: {
      ...global.discovery,
      ...(overrides.discovery || {}),
    } as ReskillConfig['discovery'],
    outputs: {
      ...global.outputs,
      ...(overrides.outputs || {}),
    } as ReskillConfig['outputs'],
  };

  return merged;
}

/**
 * Merges two partial configurations.
 */
export function mergePartialConfigs(
  base: ReskillConfigOverrides,
  overrides: ReskillConfigOverrides,
): ReskillConfigOverrides {
  const merged: ReskillConfigOverrides = {
    ...base,
    ...overrides,
    constitution: {
      ...(base.constitution || {}),
      ...(overrides.constitution || {}),
    } as ReskillConfigOverrides['constitution'],
    discovery: {
      ...(base.discovery || {}),
      ...(overrides.discovery || {}),
    } as ReskillConfigOverrides['discovery'],
    outputs: {
      ...(base.outputs || {}),
      ...(overrides.outputs || {}),
    } as ReskillConfigOverrides['outputs'],
  };
  return merged;
}
