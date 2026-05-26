import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config/keys.js';

export async function streamRender(
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const config = loadConfig();
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  let full = '';
  let retryDelay = 100;

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      stream.on('text', (text) => {
        full += text;
        onChunk?.(text);
      });

      await stream.finalMessage();
      return full;
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError && attempt < 2) {
        await new Promise((r) => setTimeout(r, retryDelay));
        retryDelay *= 2;
        full = '';
        continue;
      }
      throw err;
    }
  }

  return full;
}
