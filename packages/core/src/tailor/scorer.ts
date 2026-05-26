import type { Experience, ParsedJD } from '../experience/types.js';

export interface ScoredExperience {
  experience: Experience;
  score: number;
}

export function scoreExperiences(
  experiences: Experience[],
  jd: ParsedJD
): ScoredExperience[] {
  const allTerms = [
    ...jd.required_skills.map((s) => ({ term: s.toLowerCase(), weight: 3 })),
    ...jd.preferred_skills.map((s) => ({ term: s.toLowerCase(), weight: 2 })),
    ...jd.keywords.map((k) => ({ term: k.toLowerCase(), weight: 1 })),
  ];

  return experiences
    .map((exp) => {
      const searchable = [
        exp.title,
        exp.role,
        exp.situation,
        exp.task,
        exp.action,
        exp.result,
        ...exp.skills,
        ...exp.ats_keywords,
        ...exp.tags,
      ]
        .join(' ')
        .toLowerCase();

      const score = allTerms.reduce((total, { term, weight }) => {
        return total + (searchable.includes(term) ? weight : 0);
      }, 0);

      return { experience: exp, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function selectTopExperiences(
  scored: ScoredExperience[],
  max = 5
): Experience[] {
  return scored.slice(0, max).map((s) => s.experience);
}
