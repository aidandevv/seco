import { getExperience } from '../experience/crud.js';
import { streamRender } from './stream.js';
import { resumeBuilder } from './prompts/resume.js';
import { linkedinSummaryBuilder, linkedinPostBuilder } from './prompts/linkedin.js';
import { readmeBuilder } from './prompts/readme.js';
import { obsidianBuilder } from './prompts/obsidian.js';
import { latexBuilder } from './prompts/latex.js';
import { coverBuilder } from './prompts/cover.js';
import { bioShortBuilder, bioMediumBuilder, bioFullBuilder } from './prompts/bio.js';
import type { Surface, Experience } from '../experience/types.js';

export interface PromptBuilder {
  systemPrompt: string;
  buildPrompt(experiences: Experience[], jobDescription?: string): string;
}

const builders: Record<Surface, PromptBuilder> = {
  resume_bullets: resumeBuilder,
  linkedin_summary: linkedinSummaryBuilder,
  linkedin_post: linkedinPostBuilder,
  github_readme: readmeBuilder,
  obsidian_note: obsidianBuilder,
  latex_bullets: latexBuilder,
  cover_letter_paragraph: coverBuilder,
  bio_short: bioShortBuilder,
  bio_medium: bioMediumBuilder,
  bio_full: bioFullBuilder,
};

export async function renderForSurface(
  experienceIds: string[],
  surface: Surface,
  jobDescription?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const experiences = experienceIds.map((id) => getExperience(id));
  const builder = builders[surface];
  const userPrompt = builder.buildPrompt(experiences, jobDescription);
  return streamRender(builder.systemPrompt, userPrompt, onChunk);
}
