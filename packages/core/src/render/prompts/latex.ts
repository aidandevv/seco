import type { Experience } from '../../experience/types.js';
import type { PromptBuilder } from '../index.js';

export const latexBuilder: PromptBuilder = {
  systemPrompt: `Generate LaTeX resume bullet points from professional experience data.
Rules:
- Each bullet is a \\item command
- Valid LaTeX only — escape special characters (%, $, &, #, _, {, }, ~, ^, \\)
- Strong action verb first, quantified result required
- No first-person pronouns
- Output ONLY the \\item lines, no surrounding environment`,

  buildPrompt(experiences: Experience[], jobDescription?: string): string {
    const _ = jobDescription;
    const expText = experiences
      .map(
        (e) =>
          `Title: ${e.title} at ${e.organization}\nAction: ${e.action}\nResult: ${e.result}\nMetrics: ${e.impact_metrics.join('; ')}`
      )
      .join('\n\n---\n\n');
    return `Generate LaTeX \\item bullets for these experiences:\n\n${expText}`;
  },
};
