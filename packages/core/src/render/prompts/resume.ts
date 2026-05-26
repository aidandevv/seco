import type { Experience } from '../../experience/types.js';
import type { PromptBuilder } from '../index.js';

export const resumeBuilder: PromptBuilder = {
  systemPrompt: `Generate ATS-optimized resume bullet points from professional experience data.
Rules:
- Start each bullet with a strong past-tense action verb (Engineered, Led, Reduced, Increased, Designed, Built)
- Every bullet must include a quantified result (%, $, scale, time saved)
- 1-2 lines per bullet maximum
- No first-person pronouns
- Naturally embed ATS keywords
- Output ONLY the bullets, one per line, each starting with •`,

  buildPrompt(experiences: Experience[], jobDescription?: string): string {
    const expText = experiences
      .map(
        (e) => `Title: ${e.title} at ${e.organization}
Role: ${e.role}
Situation: ${e.situation}
Task: ${e.task}
Action: ${e.action}
Result: ${e.result}
Metrics: ${e.impact_metrics.join('; ')}
Keywords: ${e.ats_keywords.join(', ')}`
      )
      .join('\n\n---\n\n');

    if (jobDescription) {
      return `Generate resume bullets. Target this job description:\n${jobDescription}\n\nExperiences:\n${expText}`;
    }
    return `Generate resume bullets for these experiences:\n\n${expText}`;
  },
};
