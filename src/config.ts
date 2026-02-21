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
    .default({
      root: '.',
      ignore: ['node_modules', 'dist', '.git'],
      depth: 5,
    }),
  outputs: z.object({
    contextFiles: z.array(z.string()),
    symlinks: z.array(z.string()).optional().default([]),
  }),
  ai: z
    .object({
      provider: z.string().default('gemini-cli'),
      commandTemplate: z.string().optional(),
    })
    .optional(),
});

export type ReskillConfig = z.infer<typeof ReskillConfigSchema>;

export const ReskillConfigOverridesSchema = ReskillConfigSchema.partial().extend({
  constitution: ReskillConfigSchema.shape.constitution.partial().optional(),
  discovery: ReskillConfigSchema.shape.discovery.removeDefault().partial().optional(),
  outputs: ReskillConfigSchema.shape.outputs.partial().optional(),
  ai: ReskillConfigSchema.shape.ai.unwrap().partial().optional(),
});

export type ReskillConfigOverrides = z.infer<typeof ReskillConfigOverridesSchema>;

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
        throw new Error(`Failed to parse reskiller.yaml at ${reskillerYamlPath}: ${e}`, {
          cause: e,
        });
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
  return ReskillConfigOverridesSchema.parse(parsed);
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
    ai: {
      ...global.ai,
      ...(overrides.ai || {}),
    } as ReskillConfig['ai'],
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
    ai: {
      ...(base.ai || {}),
      ...(overrides.ai || {}),
    } as ReskillConfigOverrides['ai'],
  };
  return merged;
}
