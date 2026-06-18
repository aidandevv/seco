import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDir = join(tmpdir(), `seco-review-save-test-${Date.now()}`);
process.env['SECO_DIR'] = testDir;

import {
  appendTranscript,
  createIntakeSession,
  getIntakeSession,
  saveReviewedIntakeSession,
} from '../index.js';
import { closeDb } from '../db/client.js';
import { SecoError } from '../errors.js';
import type { ExperienceDraft } from '../experience/types.js';

const draft: ExperienceDraft = {
  title: 'Realtime Pipeline',
  organization: 'Acme',
  role: 'Lead engineer',
  role_type: 'project',
  start_date: '2024-01-01',
  end_date: null,
  situation: 'The analytics team needed lower latency.',
  task: 'I owned the migration to streaming.',
  action: 'I designed the Kafka pipeline and rollout plan.',
  result: 'Latency dropped by 60%.',
  skills: ['Kafka', 'TypeScript'],
  impact_metrics: ['Latency dropped by 60%'],
  ats_keywords: ['streaming', 'Kafka'],
  tags: ['data'],
  fieldConfidence: {
    title: 'high',
    organization: 'high',
    role: 'high',
    start_date: 'high',
    situation: 'high',
    task: 'high',
    action: 'high',
    result: 'high',
  },
  overallConfidence: 'high',
  missingFields: [],
  readyForReview: true,
};

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('saveReviewedIntakeSession', () => {
  it('creates an experience and marks the session saved', async () => {
    const session = createIntakeSession('text');
    await appendTranscript(session.id, 'I led a realtime pipeline migration.');
    const completed = await saveReviewedIntakeSession(session.id, draft);

    expect(completed.experience.title).toBe('Realtime Pipeline');
    expect(completed.summary).toContain(completed.experience.id);
    expect(getIntakeSession(session.id)?.status).toBe('saved');
    expect(getIntakeSession(session.id)?.experience_id).toBe(completed.experience.id);
  });

  it('returns the same saved experience for repeated saves', async () => {
    const session = createIntakeSession('text');
    await appendTranscript(session.id, 'I led a realtime pipeline migration.');
    const first = await saveReviewedIntakeSession(session.id, draft);
    const second = await saveReviewedIntakeSession(session.id, draft);
    expect(second.experience.id).toBe(first.experience.id);
  });

  it('rejects drafts missing required fields', async () => {
    const session = createIntakeSession('text');
    await expect(saveReviewedIntakeSession(session.id, { ...draft, title: '' }))
      .rejects.toBeInstanceOf(SecoError);
  });

  it('rejects drafts missing skills and impact metrics', async () => {
    const session = createIntakeSession('text');
    await expect(saveReviewedIntakeSession(session.id, { ...draft, skills: [], impact_metrics: [] }))
      .rejects.toBeInstanceOf(SecoError);
  });
});
