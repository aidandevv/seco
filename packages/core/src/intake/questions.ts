import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config/keys.js';

const SYSTEM = `You are a professional experience coach helping someone articulate their work history.
Ask focused, specific questions to draw out the full STAR story (Situation, Task, Action, Result) behind their experience.
Rules:
- One question per response, max 2 sentences
- Ask for specifics: metrics, team sizes, tools used, decisions made
- When you have enough for all STAR components, append [COMPLETE] at the end of your response`;

export async function generateNextQuestion(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const config = loadConfig();
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  // Anthropic API requires messages to start with a user turn.
  // Session history starts with an assistant message (the first question),
  // so we always prepend a synthetic opener to satisfy the constraint.
  const OPENER = { role: 'user' as const, content: 'Please begin the intake session with your opening question.' };
  const apiMessages = [OPENER, ...messages];

  let full = '';
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: SYSTEM,
    messages: apiMessages,
  });

  stream.on('text', (text) => {
    full += text;
    onChunk?.(text);
  });

  await stream.finalMessage();
  return full;
}
