import type { Experience } from '../../experience/types.js';
import type { PromptBuilder } from '../index.js';

export const coverBuilder: PromptBuilder = {
  systemPrompt: `Write cover letter body paragraphs from professional experience data.
Rules:
- One experience per paragraph
- Connect the experience to the target company or role
- Warm but professional tone
- 100-150 words per paragraph
- No greeting or sign-off — body paragraphs only`,

  buildPrompt(experiences: Experience[], jobDescription?: string): string {
    const expText = experiences
      .map(
        (e) =>
          `Experience: ${e.title} at ${e.organization}\n${e.situation}\n${e.action}\n${e.result}`
      )
      .join('\n\n---\n\n');
    const jdNote = jobDescription
      ? `\nTarget role/company context:\n${jobDescription.slice(0, 600)}\n\n`
      : '';
    return `${jdNote}Write cover letter paragraphs for these experiences:\n\n${expText}`;
  },
};
