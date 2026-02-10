import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const ReskillConfigSchema = z.object({
  skillsDir: z.string().default('skills'),
  constitution: z.object({
    architecture: z.string(),
    patterns: z.string().optional(),
  }),
  discovery: z
    .object({
      root: z.string().default('.'),
      markers: z.array(z.string()).default(['.skills']),
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

export function loadConfig(cwd: string = process.cwd()): ReskillConfig {
  const configPath = path.join(cwd, 'reskill.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found at ${configPath}`);
  }

  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return ReskillConfigSchema.parse(rawConfig);
}
