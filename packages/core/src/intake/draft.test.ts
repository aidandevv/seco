import { describe, expect, it } from 'vitest';
import {
  applyConversationalCorrections,
  DRAFT_EXTRACTOR_MODEL,
  getNextDraftQuestionTarget,
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
    expect(draft.qualityScore?.overall).toBeGreaterThan(0);
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
    expect(draft.fieldNotes?.result).toContain('result');
    expect(lifecycleForDraft(draft)).not.toBe('ready_for_review');
  });

  it('chooses the highest-value missing question target', () => {
    const draft = normalizeExperienceDraft({
      organization: 'Acme',
      role: 'Engineer',
      fieldConfidence: { organization: 'high', role: 'high' },
    });
    expect(getNextDraftQuestionTarget(draft)).toEqual({
      field: 'title',
      prompt: 'What should we call this experience?',
    });
  });

  it('applies conversational correction commands with field notes', () => {
    const draft = normalizeExperienceDraft({
      title: 'Old title',
      organization: 'Old org',
      role: 'Engineer',
      fieldConfidence: { title: 'high', organization: 'medium', role: 'high' },
    });
    applyConversationalCorrections(draft, [{ role: 'user', content: 'change the company to NewCo' }]);
    expect(draft.organization).toBe('NewCo');
    expect(draft.fieldConfidence.organization).toBe('high');
    expect(draft.fieldNotes?.organization).toBe('Updated organization');
  });
});
