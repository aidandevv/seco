import type { Experience } from '../../experience/types.js';
import type { PromptBuilder } from '../index.js';

function formatExperience(e: Experience): string {
  return [
    `Title: ${e.title}`,
    `Organization: ${e.organization}`,
    `Role: ${e.role}`,
    `Dates: ${e.start_date}${e.end_date ? ` to ${e.end_date}` : ''}`,
    `Situation: ${e.situation}`,
    `Task: ${e.task}`,
    `Action: ${e.action}`,
    `Result: ${e.result}`,
    `Skills: ${e.skills.join(', ')}`,
    `Impact metrics: ${e.impact_metrics.join(', ')}`,
    `ATS keywords: ${e.ats_keywords.join(', ')}`,
    `Tags: ${e.tags.join(', ')}`,
  ].join('\n');
}

export const obsidianBuilder: PromptBuilder = {
  systemPrompt: `Write an Obsidian vault-ready professional memory note from seco experience data.
Rules:
- Output only Markdown.
- Start with YAML frontmatter containing title, aliases, tags, role_type, organization, start_date, end_date, seco_experience_ids, and source.
- Use Obsidian-friendly internal links with [[...]] for organizations, skills, projects, and related themes.
- Include sections: Summary, STAR, Evidence, Reusable Copy Angles, Related Notes, and Next Review.
- Preserve concrete metrics exactly when available.
- Prefer durable knowledge-management language over resume marketing language.
- Keep the note skimmable, with bullets where helpful.
- Do not invent dates, employers, metrics, or links that are not supported by the source data.`,

  buildPrompt(experiences: Experience[], jobDescription?: string): string {
    const expText = experiences.map(formatExperience).join('\n\n---\n\n');
    const jdNote = jobDescription
      ? `\nOptional context to connect this note to a current opportunity:\n${jobDescription.slice(0, 1000)}\n`
      : '';
    return `${jdNote}Create one Obsidian note that can be saved inside a professional identity vault. Use these seco experiences as the source of truth:\n\n${expText}`;
  },
};
