import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const expectedTools = [
  'start_intake_session',
  'continue_intake_session',
  'save_reviewed_intake_session',
  'get_intake_session_result',
  'save_experience',
  'list_experiences',
  'get_experience',
  'render_for_surface',
  'tailor_to_jd',
  'export_obsidian_note',
  'export_latex',
  'update_experience',
  'delete_experience',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return result.stdout ?? '';
}

function packageBinPath(installDir) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return join(installDir, 'node_modules', '.bin', `seco-mcp${suffix}`);
}

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const cachePath = join(repoRoot, '.npm-cache');
const tempRoot = await mkdtemp(join(tmpdir(), 'seco-tarball-smoke-'));
let tarballPath;

try {
  await mkdir(cachePath, { recursive: true });
  const packOutput = run('npm', ['pack', '--json', '--cache', cachePath], {
    cwd: repoRoot,
    capture: true,
  });
  const [packInfo] = JSON.parse(packOutput);
  if (!packInfo?.filename) {
    throw new Error('npm pack did not return a tarball filename');
  }
  tarballPath = join(repoRoot, packInfo.filename);

  const installDir = join(tempRoot, 'install');
  await mkdir(installDir, { recursive: true });
  run('npm', ['init', '-y'], { cwd: installDir, capture: true });
  run('npm', ['install', '--cache', cachePath, '--no-audit', '--no-fund', tarballPath], {
    cwd: installDir,
  });

  const command = packageBinPath(installDir);
  if (!existsSync(command)) {
    throw new Error(`Expected package binary not found at ${command}`);
  }

  const dataDir = join(tempRoot, 'seco-data');
  const client = new Client(
    { name: 'seco-packed-smoke', version: '1.0.0' },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command,
    args: [],
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-smoke-test',
      SECO_DIR: dataDir,
    },
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = new Set(tools.map((tool) => tool.name));
    const missing = expectedTools.filter((tool) => !names.has(tool));
    if (missing.length > 0) {
      throw new Error(`Packed MCP server is missing tools: ${missing.join(', ')}`);
    }
  } finally {
    await client.close();
  }

  console.log(`Packed tarball smoke passed for ${packInfo.filename}`);
} finally {
  if (tarballPath) {
    await rm(tarballPath, { force: true });
  }
  await rm(tempRoot, { recursive: true, force: true });
}
