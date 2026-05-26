import { describe, it, expect } from 'vitest';
import { resumeBuilder } from './resume.js';
import { linkedinSummaryBuilder, linkedinPostBuilder } from './linkedin.js';
import { latexBuilder } from './latex.js';
import type { Experience } from '../../experience/types.js';

const exp: Experience = {
  id: 'test-id',
  title: 'Software Engineer',
  organization: 'TechCorp',
  role: 'SWE',
  role_type: 'full-time',
  start_date: '2022-01-01',
  end_date: '2024-01-01',
  raw_transcript: 'transcript here',
  situation: 'The team needed faster CI.',
  task: 'I led the CI migration.',
  action: 'Built a new pipeline using GitHub Actions and Docker layer caching.',
  result: 'Reduced build times by 60%, saving ~2 hours/day per engineer.',
  skills: ['GitHub Actions', 'Docker', 'CI/CD'],
  impact_metrics: ['Reduced build times by 60%', 'Saved ~2 hours/day per engineer'],
  ats_keywords: ['CI/CD', 'GitHub Actions', 'DevOps', 'Docker'],
  tags: ['engineering', 'devops'],
  version: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

describe('resumeBuilder', () => {
  it('includes experience title in prompt', () => {
    const prompt = resumeBuilder.buildPrompt([exp]);
    expect(prompt).toContain('Software Engineer');
  });

  it('includes impact metrics in prompt', () => {
    const prompt = resumeBuilder.buildPrompt([exp]);
    expect(prompt).toContain('Reduced build times by 60%');
  });

  it('includes job description when provided', () => {
    const prompt = resumeBuilder.buildPrompt([exp], 'Looking for a DevOps engineer');
    expect(prompt).toContain('DevOps engineer');
  });

  it('systemPrompt requires action verb and quantified result', () => {
    expect(resumeBuilder.systemPrompt).toContain('action verb');
    expect(resumeBuilder.systemPrompt).toContain('quantified');
  });
});

describe('linkedinSummaryBuilder', () => {
  it('mentions ~300 words in systemPrompt', () => {
    expect(linkedinSummaryBuilder.systemPrompt).toContain('300');
  });

  it('includes experience in prompt', () => {
    const prompt = linkedinSummaryBuilder.buildPrompt([exp]);
    expect(prompt).toContain('TechCorp');
  });
});

describe('linkedinPostBuilder', () => {
  it('includes 150-300 word constraint in systemPrompt', () => {
    expect(linkedinPostBuilder.systemPrompt).toContain('150');
    expect(linkedinPostBuilder.systemPrompt).toContain('300');
  });
});

describe('latexBuilder', () => {
  it('mentions \\item in systemPrompt', () => {
    expect(latexBuilder.systemPrompt).toContain('\\item');
  });
});
