import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config/keys.js';
import type { ParsedJD } from '../experience/types.js';

const SYSTEM = `Parse a job description and extract structured data. Return ONLY valid JSON:
{
  "required_skills": ["list of must-have skills"],
  "preferred_skills": ["list of nice-to-have skills"],
  "keywords": ["important terms from the JD for ATS matching"],
  "vocabulary": ["company/domain-specific language to mirror"],
  "confidence": "high|medium|low"
}
Return low confidence if the input is too short or malformed.`;

export async function parseJobDescription(jd: string): Promise<ParsedJD> {
  if (!jd || jd.trim().length < 20) {
    return { required_skills: [], preferred_skills: [], keywords: [], vocabulary: [], confidence: 'low' };
  }

  const config = loadConfig();
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: jd }],
    });

    const block = response.content[0];
    if (block.type !== 'text') return fallbackParse(jd);

    let text = block.text.trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) text = fenced[1].trim();

    return JSON.parse(text) as ParsedJD;
  } catch {
    return fallbackParse(jd);
  }
}

function fallbackParse(jd: string): ParsedJD {
  const words = jd
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 30);
  return {
    required_skills: [],
    preferred_skills: [],
    keywords: words,
    vocabulary: [],
    confidence: 'low',
  };
}
