import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config/keys.js';
import type { ExperienceDraft } from '../experience/types.js';
import type { NextDraftQuestionTarget } from './draft.js';

const SYSTEM = `You are a professional experience coach helping someone articulate their work history.
Ask focused, specific questions to draw out the full STAR story (Situation, Task, Action, Result) behind their experience.
Rules:
- Plain text only. Do not use markdown, bullets, numbering, headings, tables, or code fences.
- One question per response, max 2 sentences
- Ask the highest-value missing question based on the current draft
- Prefer specifics: metrics, team sizes, tools used, decisions made
- If the draft is ready for review, say you have enough to review and append [COMPLETE]`;

export function stripCompletionMarker(text: string): string {
  return text.replace(/\s*\[COMPLETE\]\s*/gi, '').trim();
}

export function hasCompletionMarker(text: string): boolean {
  return /\[COMPLETE\]/i.test(text);
}

export async function generateNextQuestion(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  draft?: ExperienceDraft,
  target?: NextDraftQuestionTarget | null,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const config = loadConfig();
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  // Anthropic API requires messages to start with a user turn.
  // Session history starts with an assistant message (the first question),
  // so we always prepend a synthetic opener to satisfy the constraint.
  const OPENER = {
    role: 'user' as const,
    content: 'Please begin the intake session with your opening question.',
  };
  const draftContext = draft
    ? [{
        role: 'user' as const,
        content: `Current structured draft JSON: ${JSON.stringify(draft)}\nHighest-value next target: ${target ? JSON.stringify(target) : 'none'}`,
      }]
    : [];
  const apiMessages = [OPENER, ...draftContext, ...messages];

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
