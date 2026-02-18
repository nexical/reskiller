import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { afterAll, beforeAll } from 'vitest';

export const TEST_TMP_DIR = path.join(os.tmpdir(), 'reskill-integration-tests');

export function setupIntegrationTest() {
  if (fs.existsSync(TEST_TMP_DIR)) {
    fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
}

export function teardownIntegrationTest() {
  if (fs.existsSync(TEST_TMP_DIR)) {
    fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  }
}

export function createTestProject(projectName: string, config: Record<string, unknown> = {}) {
  const projectDir = path.join(TEST_TMP_DIR, projectName);
  fs.mkdirSync(projectDir, { recursive: true });

  // Create nexical.yaml
  const nexicalYaml = `
reskill:
  skillsDir: "skills"
  discovery:
    root: "."
    markers: [".skills"]
    ignore: ["node_modules"]
    depth: 5
  outputs:
    contextFiles: []
    symlinks: []
    `;
  fs.writeFileSync(path.join(projectDir, 'nexical.yaml'), nexicalYaml);

  // Create package.json
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({
      name: projectName,
      version: '0.0.0',
    }),
  );

  return projectDir;
}

beforeAll(() => {
  setupIntegrationTest();
});

afterAll(() => {
  teardownIntegrationTest();
});
