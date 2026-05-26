import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { SecoError } from '../errors.js';
import type { Experience, RoleType } from './types.js';

type ExperienceRow = Record<string, unknown>;

function serialize(e: Experience): ExperienceRow {
  return {
    ...e,
    skills: JSON.stringify(e.skills),
    impact_metrics: JSON.stringify(e.impact_metrics),
    ats_keywords: JSON.stringify(e.ats_keywords),
    tags: JSON.stringify(e.tags),
  };
}

function deserialize(row: ExperienceRow): Experience {
  return {
    ...(row as Omit<Experience, 'skills' | 'impact_metrics' | 'ats_keywords' | 'tags'>),
    skills: JSON.parse(row['skills'] as string),
    impact_metrics: JSON.parse(row['impact_metrics'] as string),
    ats_keywords: JSON.parse(row['ats_keywords'] as string),
    tags: JSON.parse(row['tags'] as string),
  } as Experience;
}

export function createExperience(
  data: Omit<Experience, 'id' | 'version' | 'created_at' | 'updated_at'>
): Experience {
  const db = getDb();
  const now = new Date().toISOString();
  const experience: Experience = { ...data, id: randomUUID(), version: 1, created_at: now, updated_at: now };

  db.prepare(`
    INSERT INTO experiences
      (id, title, organization, role, role_type, start_date, end_date, raw_transcript,
       situation, task, action, result, skills, impact_metrics, ats_keywords, tags,
       version, created_at, updated_at)
    VALUES
      (@id, @title, @organization, @role, @role_type, @start_date, @end_date, @raw_transcript,
       @situation, @task, @action, @result, @skills, @impact_metrics, @ats_keywords, @tags,
       @version, @created_at, @updated_at)
  `).run(serialize(experience));

  return experience;
}

export function getExperience(id: string): Experience {
  const db = getDb();
  const row = db.prepare('SELECT * FROM experiences WHERE id = ?').get(id) as ExperienceRow | undefined;
  if (!row) throw new SecoError('EXPERIENCE_NOT_FOUND', id);
  return deserialize(row);
}

export function listExperiences(filter?: {
  tag?: string;
  role_type?: RoleType;
  keyword?: string;
  limit?: number;
  offset?: number;
}): Experience[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter?.role_type) {
    clauses.push('role_type = ?');
    params.push(filter.role_type);
  }
  if (filter?.tag) {
    clauses.push('tags LIKE ?');
    params.push(`%${filter.tag}%`);
  }
  if (filter?.keyword) {
    const like = `%${filter.keyword}%`;
    clauses.push(
      '(title LIKE ? OR organization LIKE ? OR situation LIKE ? OR task LIKE ? OR action LIKE ? OR result LIKE ?)'
    );
    params.push(like, like, like, like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  let sql = `SELECT * FROM experiences ${where} ORDER BY created_at DESC`;

  if (filter?.limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }
  if (filter?.offset !== undefined) {
    sql += ' OFFSET ?';
    params.push(filter.offset);
  }

  return (db.prepare(sql).all(...params) as ExperienceRow[]).map(deserialize);
}

export function updateExperienceField(
  id: string,
  field: keyof Experience,
  value: unknown
): Experience {
  const db = getDb();
  const existing = getExperience(id);

  db.prepare(
    'INSERT INTO experience_versions (id, experience_id, version, snapshot, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(randomUUID(), id, existing.version, JSON.stringify(existing), new Date().toISOString());

  const serialized = Array.isArray(value) ? JSON.stringify(value) : value;
  db.prepare(
    `UPDATE experiences SET ${String(field)} = ?, version = ?, updated_at = ? WHERE id = ?`
  ).run(serialized, existing.version + 1, new Date().toISOString(), id);

  return getExperience(id);
}

export function deleteExperience(id: string): void {
  const db = getDb();
  getExperience(id);
  db.prepare('DELETE FROM experience_versions WHERE experience_id = ?').run(id);
  db.prepare('DELETE FROM experiences WHERE id = ?').run(id);
}
