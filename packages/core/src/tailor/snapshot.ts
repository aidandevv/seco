import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import type { ApplicationSnapshot, Experience, ParsedJD, GapAnalysis, Surface } from '../experience/types.js';

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
