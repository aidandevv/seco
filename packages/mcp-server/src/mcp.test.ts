import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { createSecoMcpServer } from './mcp.js';

async function withConnectedClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'seco-mcp-app-'));
  process.env['SECO_DIR'] = join(dir, 'seco-data');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets/mcp-app.js'), 'document.body.dataset.seco = "app";');
  writeFileSync(join(dir, 'assets/mcp-app.css'), '.seco { color: CanvasText; }');
  const server = createSecoMcpServer(dir);
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    {
      capabilities: {
        extensions: {
          'io.modelcontextprotocol/ui': {
            mimeTypes: ['text/html;profile=mcp-app'],
          },
        },
      } as ClientCapabilities,
    }
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
    return await run(client);
  } finally {
    await client.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('createSecoMcpServer', () => {
  it('lists the native intake app tools with UI metadata', async () => {
    await withConnectedClient(async (client) => {
      const { tools } = await client.listTools();
      const start = tools.find((tool) => tool.name === 'start_intake_session');
      const cont = tools.find((tool) => tool.name === 'continue_intake_session');
      const save = tools.find((tool) => tool.name === 'save_reviewed_intake_session');

      expect(start?._meta).toMatchObject({ ui: { resourceUri: 'ui://seco/intake.html' } });
      expect(cont?._meta).toMatchObject({ ui: { resourceUri: 'ui://seco/intake.html' } });
      expect(save?._meta).toMatchObject({
        ui: { resourceUri: 'ui://seco/intake.html', visibility: ['app'] },
      });
    });
  });

  it('serves the bundled app resource with the MCP App MIME type and CSP metadata', async () => {
    await withConnectedClient(async (client) => {
      const resource = await client.readResource({ uri: 'ui://seco/intake.html' });
      const content = resource.contents[0];
      expect(content?.mimeType).toBe('text/html;profile=mcp-app');
      expect(content).toMatchObject({
        uri: 'ui://seco/intake.html',
        _meta: {
          ui: {
            prefersBorder: false,
            csp: {
              connectDomains: [],
              resourceDomains: [],
            },
          },
        },
      });
      expect('text' in content! ? content.text : '').toContain('document.body.dataset.seco');
    });
  });

  it('exposes Claude Code resources for recent experiences and snapshots', async () => {
    await withConnectedClient(async (client) => {
      const { resources } = await client.listResources();
      expect(resources).toEqual(expect.arrayContaining([
        expect.objectContaining({ uri: 'experiences://recent', mimeType: 'text/markdown' }),
        expect.objectContaining({ uri: 'snapshots://recent', mimeType: 'text/markdown' }),
      ]));

      const recent = await client.readResource({ uri: 'experiences://recent' });
      const content = recent.contents[0];
      expect(content?.mimeType).toBe('text/markdown');
      expect('text' in content! ? content.text : '').toContain('Recent seco experiences');
    });
  });

  it('exposes Claude Code slash-command prompts', async () => {
    await withConnectedClient(async (client) => {
      const { prompts } = await client.listPrompts();
      expect(prompts.map((prompt) => prompt.name)).toEqual(expect.arrayContaining([
        'capture_experience',
        'capture_voice_experience',
        'review_draft',
        'render_obsidian_note',
        'render_resume',
        'tailor_to_jd',
      ]));

      const prompt = await client.getPrompt({
        name: 'capture_experience',
        arguments: { focus: 'website redesign' },
      });
      const text = prompt.messages[0]?.content.type === 'text'
        ? prompt.messages[0].content.text
        : '';
      expect(text).toContain('mcp__seco__start_intake_session');
      expect(text).toContain('website redesign');

      const voicePrompt = await client.getPrompt({
        name: 'capture_voice_experience',
        arguments: { focus: 'launch retrospective' },
      });
      const voiceText = voicePrompt.messages[0]?.content.type === 'text'
        ? voicePrompt.messages[0].content.text
        : '';
      expect(voiceText).toContain('mode="voice"');
      expect(voiceText).toContain('intake_url');
      expect(voiceText).toContain('launch retrospective');

      const obsidianPrompt = await client.getPrompt({
        name: 'render_obsidian_note',
        arguments: { experience_ids: 'exp-1, exp-2', vault_context: 'People notes use @person tags' },
      });
      const obsidianText = obsidianPrompt.messages[0]?.content.type === 'text'
        ? obsidianPrompt.messages[0].content.text
        : '';
      expect(obsidianText).toContain('surface="obsidian_note"');
      expect(obsidianText).toContain('exp-1, exp-2');
      expect(obsidianText).toContain('People notes use @person tags');
    });
  });
});
