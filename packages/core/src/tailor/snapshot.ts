import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import type { ApplicationSnapshot, Experience, ParsedJD, GapAnalysis, Surface } from '../experience/types.js';

type SnapshotRow = {
  id: string;
  role_title: string;
  company: string;
  jd_raw: string;
  jd_parsed: string;
  experience_ids: string;
  rendered_outputs: string;
  gap_analysis: string;
  created_at: string;
};

function deserializeSnapshot(row: SnapshotRow): ApplicationSnapshot {
  return {
    id: row.id,
    role_title: row.role_title,
    company: row.company,
    jd_raw: row.jd_raw,
    jd_parsed: JSON.parse(row.jd_parsed) as ParsedJD,
    experience_ids: JSON.parse(row.experience_ids) as string[],
    rendered_outputs: JSON.parse(row.rendered_outputs) as Partial<Record<Surface, string>>,
    gap_analysis: JSON.parse(row.gap_analysis) as GapAnalysis,
    created_at: row.created_at,
  };
}

export function computeGapAnalysis(
  selected: Experience[],
  jd: ParsedJD
): GapAnalysis {
  const gap: GapAnalysis = {};
  const searchable = selected
    .flatMap((e) => [...e.skills, ...e.ats_keywords])
    .map((s) => s.toLowerCase());

  for (const skill of jd.required_skills) {
    const matched = searchable.filter((s) => s.includes(skill.toLowerCase())).length;
    gap[skill] = Math.min(1.0, matched / Math.max(1, selected.length) * 2);
  }

  return gap;
}

export function saveSnapshot(
  roleTitle: string,
  company: string,
  jdRaw: string,
  jdParsed: ParsedJD,
  selected: Experience[],
  renderedOutputs: Partial<Record<Surface, string>>,
  gapAnalysis: GapAnalysis
): ApplicationSnapshot {
  const db = getDb();
  const snapshot: ApplicationSnapshot = {
    id: randomUUID(),
    role_title: roleTitle,
    company,
    jd_raw: jdRaw,
    jd_parsed: jdParsed,
    experience_ids: selected.map((e) => e.id),
    rendered_outputs: renderedOutputs,
    gap_analysis: gapAnalysis,
    created_at: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO application_snapshots
      (id, role_title, company, jd_raw, jd_parsed, experience_ids, rendered_outputs, gap_analysis, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.id,
    snapshot.role_title,
    snapshot.company,
    snapshot.jd_raw,
    JSON.stringify(snapshot.jd_parsed),
    JSON.stringify(snapshot.experience_ids),
    JSON.stringify(snapshot.rendered_outputs),
    JSON.stringify(snapshot.gap_analysis),
    snapshot.created_at
  );

  return snapshot;
}

export function getSnapshot(id: string): ApplicationSnapshot | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM application_snapshots WHERE id = ?').get(id) as SnapshotRow | undefined;
  return row ? deserializeSnapshot(row) : null;
}

export function listSnapshots(limit = 10): ApplicationSnapshot[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM application_snapshots ORDER BY created_at DESC LIMIT ?').all(limit) as SnapshotRow[];
  return rows.map(deserializeSnapshot);
}
