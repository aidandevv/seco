#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig, validateConfig, runFirstTimeSetup } from '@seco/core';
import { toolDefinitions } from './tools/definitions.js';
import { handleTool } from './tools/handler.js';
import { registerWsHandlers } from './routes/ws.js';
import { setRuntimeContext } from './runtime.js';
import { configureHttpApp } from './http-app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV = process.argv.includes('--dev');

function findFreePort(preferred: number, maxPort = 65535): Promise<number> {
  if (preferred > maxPort) {
    return Promise.reject(new Error(`No available local port found between 3001 and ${maxPort}`));
  }
  return new Promise((resolve) => {
    const srv = createNetServer();
    srv.listen(preferred, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', () => resolve(findFreePort(preferred + 1, maxPort)));
  });
}

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
      '  {\n    "mcpServers": {\n      "seco": {\n        "command": "npx",\n        "args": ["seco-mcp"]\n      }\n    }\n  }\n\n'
    );
    process.stderr.write(
      '  Config file location: ~/Library/Application Support/Claude/claude_desktop_config.json\n\n'
    );
  }

  // Start local Express + WebSocket server
  const app = express();
  const webUiDist = join(__dirname, '../../web-ui/dist');
  const { webUiBuilt } = configureHttpApp(app, {
    dev: DEV,
    webUiDist,
    log: (message) => process.stderr.write(message),
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('error', () => { /* httpServer error handler manages this */ });
  registerWsHandlers(wss);

  const serverPort = await findFreePort(3001);
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(serverPort, resolve);
    httpServer.on('error', reject);
  });
  if (serverPort !== 3001) {
    process.stderr.write(`  Note: port 3001 was in use, using ${serverPort} for seco server\n`);
  }

  const uiUrl = `http://localhost:${serverPort}`;
  setRuntimeContext({ apiPort: serverPort, uiPort: serverPort, uiUrl });
  if (webUiBuilt) {
    process.stderr.write(`  Guided intake UI: ${uiUrl}\n`);
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
