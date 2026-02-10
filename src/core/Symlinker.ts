import * as fs from 'node:fs';
import * as path from 'node:path';
import { ReskillConfig } from '../config.js';

export function ensureSymlinks(config: ReskillConfig, cwd: string = process.cwd()) {
  const symlinks = config.outputs?.symlinks;
  if (!symlinks || symlinks.length === 0) return;

  const skillsAbsPath = path.resolve(cwd, config.skillsDir);
  let gitignoreUpdated = false;
  const gitignorePath = path.join(cwd, '.gitignore');
  let gitignoreContent = '';

  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  } else {
    // Create .gitignore if it doesn't exist? Reskill assumes existing repo usually.
    // If not, maybe we create it.
    gitignoreContent = '';
  }

  for (const linkTarget of symlinks) {
    const linkAbsPath = path.resolve(cwd, linkTarget);
    const linkDir = path.dirname(linkAbsPath);

    // Ensure parent directory exists for the symlink
    if (!fs.existsSync(linkDir)) {
      fs.mkdirSync(linkDir, { recursive: true });
    }

    if (!fs.existsSync(linkAbsPath)) {
      try {
        const relativeTarget = path.relative(linkDir, skillsAbsPath);
        fs.symlinkSync(relativeTarget, linkAbsPath, 'dir');
        console.info(`🔗 Created symlink: ${linkTarget} -> ${config.skillsDir}`);
      } catch (e) {
        console.error(`❌ Failed to create symlink at ${linkTarget}:`, e);
      }
    } else {
      const stats = fs.lstatSync(linkAbsPath);
      if (!stats.isSymbolicLink()) {
        console.warn(`⚠️  Target ${linkTarget} exists and is NOT a symlink. Skipping.`);
      }
    }

    if (!gitignoreContent.includes(linkTarget)) {
      gitignoreContent += `\n${linkTarget}`;
      gitignoreUpdated = true;
    }
  }

  if (gitignoreUpdated) {
    fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
    console.info('📝 Updated .gitignore with new symlinks.');
  }
}
