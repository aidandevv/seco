import { describe, it, expect } from 'vitest';
import { scoreExperiences, selectTopExperiences } from './scorer.js';
import type { Experience, ParsedJD } from '../experience/types.js';

const makeExp = (overrides: Partial<Experience>): Experience => ({
  id: 'id',
  title: 'Engineer',
  organization: 'Corp',
  role: 'SWE',
  role_type: 'full-time',
  start_date: '2022-01-01',
  end_date: null,
  raw_transcript: '',
  situation: '',
  task: '',
  action: '',
  result: '',
  skills: [],
  impact_metrics: [],
  ats_keywords: [],
  tags: [],
  version: 1,
  created_at: '2022-01-01T00:00:00Z',
  updated_at: '2022-01-01T00:00:00Z',
  ...overrides,
});

const jd: ParsedJD = {
  required_skills: ['React', 'TypeScript'],
  preferred_skills: ['GraphQL'],
  keywords: ['frontend', 'component'],
  vocabulary: [],
  confidence: 'high',
};

describe('scoreExperiences', () => {
  it('ranks experiences with matching required skills higher', () => {
    const relevant = makeExp({ id: 'a', skills: ['React', 'TypeScript'], title: 'Frontend Engineer' });
    const irrelevant = makeExp({ id: 'b', skills: ['Java', 'Spring'], title: 'Backend Engineer' });

    const scored = scoreExperiences([irrelevant, relevant], jd);
    expect(scored[0].experience.id).toBe('a');
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });

  it('awards higher weight to required_skills than keywords', () => {
    const requiredMatch = makeExp({ id: 'req', skills: ['React'] });
    const keywordOnly = makeExp({ id: 'kw', ats_keywords: ['frontend'] });

    const scored = scoreExperiences([requiredMatch, keywordOnly], jd);
    expect(scored[0].experience.id).toBe('req');
  });

  it('returns all experiences sorted by score descending', () => {
    const a = makeExp({ id: 'a', skills: ['React', 'TypeScript', 'GraphQL'] });
    const b = makeExp({ id: 'b', skills: ['React'] });
    const c = makeExp({ id: 'c', skills: [] });

    const scored = scoreExperiences([c, b, a], jd);
    const ids = scored.map((s) => s.experience.id);
    expect(ids[0]).toBe('a');
    expect(ids[2]).toBe('c');
  });
});

describe('selectTopExperiences', () => {
  it('returns at most max experiences', () => {
    const scored = Array.from({ length: 10 }, (_, i) =>
      ({ experience: makeExp({ id: String(i) }), score: 10 - i })
    );
    expect(selectTopExperiences(scored, 3)).toHaveLength(3);
  });

  it('returns all if fewer than max', () => {
    const scored = [{ experience: makeExp({ id: 'a' }), score: 5 }];
    expect(selectTopExperiences(scored, 5)).toHaveLength(1);
  });
});
