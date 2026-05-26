import type { Experience } from '../../experience/types.js';
import type { PromptBuilder } from '../index.js';

export const readmeBuilder: PromptBuilder = {
  systemPrompt: `Write a GitHub README project summary from professional experience data.
Rules:
- Third-person or passive voice
- Lead with what was built, not who built it
- Name specific technologies, tools, and frameworks
- Native GitHub Flavored Markdown (headers, bullets, code blocks where appropriate)
- Contribution framing — suitable for an open-source or portfolio README
- 100-200 words`,

  buildPrompt(experiences: Experience[], jobDescription?: string): string {
    const _ = jobDescription;
    const expText = experiences
      .map(
        (e) =>
          `Project: ${e.title}\nOrg: ${e.organization}\nWhat was done: ${e.action}\nOutcome: ${e.result}\nSkills: ${e.skills.join(', ')}`
      )
      .join('\n\n');
    return `Write a GitHub README summary for this project:\n\n${expText}`;
  },
};
