import { z } from 'zod';

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

export function getReskillConfig(cliConfig: Record<string, unknown>): ReskillConfig {
  const reskillConfig = cliConfig?.reskill;
  if (!reskillConfig) {
    throw new Error('Reskill configuration not found in nexical.yaml under "reskill" key.');
  }
  return ReskillConfigSchema.parse(reskillConfig);
}
