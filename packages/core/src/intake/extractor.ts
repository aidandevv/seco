import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config/keys.js';
import type { Experience, RoleType } from '../experience/types.js';

type ExtractionResult = Omit<Experience, 'id' | 'version' | 'created_at' | 'updated_at' | 'raw_transcript'>;

const SYSTEM = `Extract structured professional experience data from this coaching conversation transcript.
Return ONLY valid JSON (no markdown, no explanation) with these exact fields:
{
  "title": "short descriptive title",
  "organization": "company or org name",
  "role": "job title or role",
  "role_type": "internship|full-time|project|leadership|research",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD or null",
  "situation": "2-4 sentences of context",
  "task": "2-4 sentences of responsibilities",
  "action": "4-6 sentences of concrete actions",
  "result": "2-4 sentences of measurable outcomes",
  "skills": ["5-10 skills"],
  "impact_metrics": ["2-5 quantified outcomes"],
  "ats_keywords": ["10-15 ATS keywords"],
  "tags": ["3-6 tags"]
}`;

export async function extractSTAR(transcript: string): Promise<ExtractionResult> {
  const config = loadConfig();
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{ role: 'user', content: transcript }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected non-text response from Claude');

  let jsonText = block.text.trim();
  // Strip markdown code fences if Claude wrapped it anyway
  const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonText = fenced[1].trim();

  const parsed = JSON.parse(jsonText) as ExtractionResult;

  // Validate role_type
  const validRoleTypes: RoleType[] = ['internship', 'full-time', 'project', 'leadership', 'research'];
  if (!validRoleTypes.includes(parsed.role_type)) {
    parsed.role_type = 'project';
  }

  return parsed;
}
