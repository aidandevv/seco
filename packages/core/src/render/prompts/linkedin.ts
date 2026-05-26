import type { Experience } from '../../experience/types.js';
import type { PromptBuilder } from '../index.js';

export const linkedinSummaryBuilder: PromptBuilder = {
  systemPrompt: `Write a LinkedIn About section from professional experience data.
Rules:
- First-person voice
- ~300 words
- Hook in the first sentence that communicates unique value
- Weave in keywords naturally in prose
- Warm, professional tone
- End with a brief call-to-action`,

  buildPrompt(experiences: Experience[], jobDescription?: string): string {
    const expText = experiences.map((e) => `${e.title} at ${e.organization}: ${e.action} → ${e.result}`).join('\n');
    const jdNote = jobDescription ? `\nOptimize for this role: ${jobDescription.slice(0, 500)}\n` : '';
    return `${jdNote}Write a LinkedIn About section for someone with this background:\n\n${expText}`;
  },
};

export const linkedinPostBuilder: PromptBuilder = {
  systemPrompt: `Write a LinkedIn post from professional experience data.
Rules:
- Hook-first opening line (no "I'm excited to share")
- Short paragraphs (1-3 sentences each)
- Conversational and authentic
- 150-300 words
- Clear story arc: challenge → action → outcome → lesson
- End with a genuine question or reflection`,

  buildPrompt(experiences: Experience[], jobDescription?: string): string {
    const exp = experiences[0];
    const _ = jobDescription;
    return `Write a LinkedIn post about this experience:\n\n${exp.situation}\n${exp.action}\n${exp.result}`;
  },
};
