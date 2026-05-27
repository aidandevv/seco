import { describe, expect, it } from 'vitest';
import {
  DRAFT_EXTRACTOR_MODEL,
  lifecycleForDraft,
  normalizeExperienceDraft,
} from './draft.js';

describe('draft extraction helpers', () => {
  it('uses the cheap draft extractor model', () => {
    expect(DRAFT_EXTRACTOR_MODEL).toBe('claude-haiku-4-5');
  });

  it('normalizes a high-confidence draft for review', () => {
    const draft = normalizeExperienceDraft({
      title: 'Realtime Pipeline',
      organization: 'Acme',
      role: 'Lead engineer',
      role_type: 'full-time',
      start_date: '2024-01-01',
      end_date: null,
      situation: 'The team needed faster analytics.',
      task: 'I owned the pipeline rewrite.',
      action: 'I designed and shipped a streaming architecture.',
      result: 'Latency dropped by 60%.',
      skills: ['Kafka'],
      impact_metrics: ['Latency dropped by 60%'],
      fieldConfidence: {
        title: 'high',
        organization: 'high',
        role: 'high',
        start_date: 'medium',
        situation: 'high',
        task: 'high',
        action: 'high',
        result: 'high',
      },
    });

    expect(draft.readyForReview).toBe(true);
    expect(draft.missingFields).toEqual([]);
    expect(lifecycleForDraft(draft)).toBe('ready_for_review');
  });

  it('marks missing STAR fields as not ready', () => {
    const draft = normalizeExperienceDraft({
      title: 'Realtime Pipeline',
      organization: 'Acme',
      role: 'Lead engineer',
      start_date: '2024-01-01',
      skills: ['Kafka'],
      fieldConfidence: {
        title: 'high',
        organization: 'high',
        role: 'high',
        start_date: 'high',
      },
    });

    expect(draft.readyForReview).toBe(false);
    expect(draft.missingFields).toContain('situation');
    expect(draft.missingFields).toContain('result');
    expect(lifecycleForDraft(draft)).not.toBe('ready_for_review');
  });
});
