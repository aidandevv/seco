import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDir = join(tmpdir(), `seco-crud-test-${Date.now()}`);
process.env['SECO_DIR'] = testDir;

import { createExperience, getExperience, listExperiences, updateExperienceField, deleteExperience } from './crud.js';
import { closeDb, getDb } from '../db/client.js';
import { SecoError } from '../errors.js';

const sample = {
  title: 'Software Engineer Intern',
  organization: 'Acme Corp',
  role: 'Intern',
  role_type: 'internship' as const,
  start_date: '2023-06-01',
  end_date: '2023-08-31',
  raw_transcript: 'I worked on the auth system...',
  situation: 'The team needed a new auth flow.',
  task: 'I was responsible for redesigning OAuth.',
  action: 'I built the new flow using NextAuth.',
  result: 'Reduced login errors by 40%.',
  skills: ['TypeScript', 'OAuth'],
  impact_metrics: ['Reduced login errors by 40%'],
  ats_keywords: ['authentication', 'OAuth', 'TypeScript'],
  tags: ['engineering', 'internship'],
};

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('createExperience', () => {
  it('creates an experience with id, version=1, timestamps', () => {
    const exp = createExperience(sample);
    expect(exp.id).toBeTruthy();
    expect(exp.version).toBe(1);
    expect(exp.created_at).toBeTruthy();
    expect(exp.skills).toEqual(['TypeScript', 'OAuth']);
  });
});

describe('getExperience', () => {
  it('retrieves a created experience by id', () => {
    const created = createExperience(sample);
    const fetched = getExperience(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe(sample.title);
  });

  it('throws SecoError EXPERIENCE_NOT_FOUND for unknown id', () => {
    expect(() => getExperience('nonexistent')).toThrow(SecoError);
    expect(() => getExperience('nonexistent')).toThrow('EXPERIENCE_NOT_FOUND');
  });
});

describe('listExperiences', () => {
  it('returns all experiences when no filter', () => {
    createExperience(sample);
    createExperience({ ...sample, title: 'Second Role', role_type: 'full-time' });
    const list = listExperiences();
    expect(list).toHaveLength(2);
  });

  it('filters by role_type', () => {
    createExperience(sample);
    createExperience({ ...sample, title: 'Second', role_type: 'full-time' });
    const internships = listExperiences({ role_type: 'internship' });
    expect(internships).toHaveLength(1);
  });

  it('filters by keyword in title', () => {
    createExperience(sample);
    createExperience({ ...sample, title: 'Product Manager' });
    const results = listExperiences({ keyword: 'Product' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Product Manager');
  });
});

describe('updateExperienceField', () => {
  it('updates a field and increments version', () => {
    const exp = createExperience(sample);
    const updated = updateExperienceField(exp.id, 'title', 'Updated Title');
    expect(updated.title).toBe('Updated Title');
    expect(updated.version).toBe(2);
  });

  it('saves a version snapshot before update', () => {
    const exp = createExperience(sample);
    updateExperienceField(exp.id, 'title', 'Updated Title');
    const db = getDb();
    const versions = db.prepare('SELECT * FROM experience_versions WHERE experience_id = ?').all(exp.id);
    expect(versions).toHaveLength(1);
  });
});

describe('deleteExperience', () => {
  it('removes the experience', () => {
    const exp = createExperience(sample);
    deleteExperience(exp.id);
    expect(() => getExperience(exp.id)).toThrow(SecoError);
  });

  it('throws EXPERIENCE_NOT_FOUND for unknown id', () => {
    expect(() => deleteExperience('nonexistent')).toThrow(SecoError);
  });
});
