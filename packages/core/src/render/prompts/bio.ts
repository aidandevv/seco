import type { Experience } from '../../experience/types.js';
import type { PromptBuilder } from '../index.js';

const bioBase = `Write in third-person. Do not start with "I". Lead with the person's current role or title.`;

export const bioShortBuilder: PromptBuilder = {
  systemPrompt: `${bioBase}\nWrite a 1-2 sentence professional bio. Format: Title + top achievement + affiliation.`,
  buildPrompt(experiences: Experience[]): string {
    const e = experiences[0];
    return `Write a short bio. Background: ${e.role} at ${e.organization}. Key achievement: ${e.result}`;
  },
};

export const bioMediumBuilder: PromptBuilder = {
  systemPrompt: `${bioBase}\nWrite a ~75-word professional bio. Narrative arc across 2-3 experiences.`,
  buildPrompt(experiences: Experience[]): string {
    const summary = experiences.map((e) => `${e.role} at ${e.organization}: ${e.result}`).join('; ');
    return `Write a medium bio. Background: ${summary}`;
  },
};

export const bioFullBuilder: PromptBuilder = {
  systemPrompt: `${bioBase}\nWrite a ~200-word professional bio. Full career arc, technical depth, personal signal.`,
  buildPrompt(experiences: Experience[], jobDescription?: string): string {
    const _ = jobDescription;
    const expText = experiences.map((e) => `${e.title} at ${e.organization}: ${e.action} → ${e.result}`).join('\n');
    return `Write a full professional bio:\n\n${expText}`;
  },
};
