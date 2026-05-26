#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Router } from 'express';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig, validateConfig, runFirstTimeSetup } from '@seco/core';
import { toolDefinitions } from './tools/definitions.js';
import { handleTool } from './tools/handler.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerAudioRoutes } from './routes/audio.js';
import { registerConfigRoutes } from './routes/config-route.js';
import { registerWsHandlers } from './routes/ws.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV = process.argv.includes('--dev');

async function main(): Promise<void> {
  let config = loadConfig();
  let { valid } = validateConfig(config);

  if (!valid) {
    await runFirstTimeSetup();
    config = loadConfig();
    const revalidated = validateConfig(config);
    if (!revalidated.valid) {
      process.stderr.write(
        `\n  Error: Required keys still missing: ${revalidated.missing.join(', ')}\n`
      );
      process.stderr.write('  Visit https://console.anthropic.com to get your Anthropic API key.\n');
      process.exit(1);
    }

    process.stderr.write('\n  All set. Add this to your Claude Desktop config:\n\n');
    process.stderr.write(
      '  {\n    "mcpServers": {\n      "seco": {\n        "command": "npx",\n        "args": ["seco"]\n      }\n    }\n  }\n\n'
    );
    process.stderr.write(
      '  Config file location: ~/Library/Application Support/Claude/claude_desktop_config.json\n\n'
    );
  }

  // Start local Express + WebSocket server
  const app = express();
  app.use(express.json());
  if (DEV) {
    app.use((req, _res, next) => {
      process.stderr.write(`  ${req.method} ${req.path}\n`);
      next();
    });
  }

  const router = Router();
  registerSessionRoutes(router);
  registerAudioRoutes(router);
  registerConfigRoutes(router);
  app.use(router);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('error', () => { /* httpServer error handler manages this */ });
  registerWsHandlers(wss);

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(3001, resolve);
    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        process.stderr.write(
          '\n  Error: port 3001 is already in use.\n  Another seco instance may be running.\n'
        );
        process.exit(1);
      }
      reject(err);
    });
  });

  // Launch Next.js web UI as a child process
  const webUiDir = join(__dirname, '../../web-ui');
  const nextBin = join(__dirname, '../../../node_modules/.bin/next');
  const nextBuilt = existsSync(join(webUiDir, '.next'));
  if (DEV) {
    const ui = spawn('node', [nextBin, 'dev', '-p', '3000'], {
      cwd: webUiDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    ui.stdout.on('data', (d: Buffer) => process.stderr.write(d));
    ui.stderr.on('data', (d: Buffer) => process.stderr.write(d));
    ui.on('error', () => { process.stderr.write('  Warning: could not start web UI\n'); });
    process.on('exit', () => ui.kill());
    process.stderr.write('  Voice intake UI (dev): http://localhost:3000\n');
  } else if (nextBuilt) {
    const ui = spawn('node', [nextBin, 'start', '-p', '3000'], {
      cwd: webUiDir,
      stdio: 'ignore',
      detached: false,
    });
    ui.on('error', () => { process.stderr.write('  Warning: could not start web UI\n'); });
    process.on('exit', () => ui.kill());
    process.stderr.write('  Voice intake UI: http://localhost:3000\n');
  } else {
    process.stderr.write(
      '  Voice intake UI: not built — run: npm run build --workspace=packages/web-ui\n'
    );
  }

  process.stderr.write('  seco is running.\n');

  // Start stdio MCP server
  const mcpServer = new Server(
    { name: 'seco', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions as unknown as Array<{ name: string; description: string; inputSchema: object }>,
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleTool(name, (args ?? {}) as Record<string, unknown>);
  });

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
