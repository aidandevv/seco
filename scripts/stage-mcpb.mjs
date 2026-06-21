import { mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const stageRoot = join(repoRoot, 'dist', 'mcpb', 'seco');
const cachePath = join(repoRoot, '.npm-cache');

const requiredBuildOutputs = [
  'packages/core/dist',
  'packages/mcp-server/dist',
  'packages/web-ui/dist',
];

function assertExists(relativePath) {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing ${relativePath}. Run npm run build before staging the MCPB.`);
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

for (const output of requiredBuildOutputs) {
  assertExists(output);
}

await rm(stageRoot, { recursive: true, force: true });
await mkdir(stageRoot, { recursive: true });
await mkdir(cachePath, { recursive: true });

const fileCopies = [
  ['mcpb/manifest.json', 'manifest.json'],
  ['package.json', 'package.json'],
  ['package-lock.json', 'package-lock.json'],
  ['packages/core/package.json', 'packages/core/package.json'],
  ['packages/mcp-server/package.json', 'packages/mcp-server/package.json'],
  ['packages/web-ui/package.json', 'packages/web-ui/package.json'],
];

const directoryCopies = [
  ['packages/core/dist', 'packages/core/dist'],
  ['packages/mcp-server/dist', 'packages/mcp-server/dist'],
  ['packages/web-ui/dist', 'packages/web-ui/dist'],
];

for (const [from, to] of fileCopies) {
  await mkdir(join(stageRoot, to, '..'), { recursive: true });
  await cp(join(repoRoot, from), join(stageRoot, to));
}

for (const [from, to] of directoryCopies) {
  await mkdir(join(stageRoot, to, '..'), { recursive: true });
  await cp(join(repoRoot, from), join(stageRoot, to), { recursive: true });
}

run('npm', ['ci', '--omit=dev', '--cache', cachePath], stageRoot);

console.log(`MCPB staging directory ready at ${stageRoot}`);
