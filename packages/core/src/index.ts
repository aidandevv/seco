import { createSession, getSession, appendToTranscript, addAssistantMessage, markSaved, markAbandoned } from './intake/session.js';
import { generateNextQuestion } from './intake/questions.js';
import { extractSTAR } from './intake/extractor.js';
import { createExperience, getExperience, listExperiences, updateExperienceField, deleteExperience } from './experience/crud.js';
import { renderForSurface } from './render/index.js';
import { parseJobDescription } from './tailor/parser.js';
import { scoreExperiences, selectTopExperiences } from './tailor/scorer.js';
import { computeGapAnalysis, saveSnapshot } from './tailor/snapshot.js';
import type { Experience, IntakeSession, ApplicationSnapshot, Surface, RoleType } from './experience/types.js';

export type { Experience, IntakeSession, ApplicationSnapshot, Surface, RoleType };
export { SecoError } from './errors.js';
export { loadConfig, validateConfig, runFirstTimeSetup } from './config/keys.js';

export async function startIntakeSession(_mode: 'voice' | 'text'): Promise<IntakeSession> {
  const session = createSession();
  const question = await generateNextQuestion([], (chunk) => process.stdout.write(chunk));
  addAssistantMessage(session.id, question);
  return getSession(session.id);
}

export function createIntakeSession(_mode: 'voice' | 'text'): IntakeSession {
  return createSession();
}

export async function appendTranscript(sessionId: string, text: string): Promise<void> {
  appendToTranscript(sessionId, text);
}

export async function getNextQuestion(
  sessionId: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const session = getSession(sessionId);
  const question = await generateNextQuestion(session.messages, onChunk);
  addAssistantMessage(sessionId, question);
  return question;
}

export async function saveSession(sessionId: string): Promise<Experience> {
  const session = getSession(sessionId);
  const extracted = await extractSTAR(session.transcript);
  const experience = createExperience({ ...extracted, raw_transcript: session.transcript });
  markSaved(sessionId, experience.id);
  return experience;
}

export async function abandonSession(sessionId: string): Promise<void> {
  markAbandoned(sessionId);
}

export { listExperiences, getExperience };

export function getIntakeSession(sessionId: string): IntakeSession | null {
  try {
    return getSession(sessionId);
  } catch {
    return null;
  }
}

export async function updateExperienceFieldPublic(
  id: string,
  field: keyof Experience,
  value: unknown
): Promise<Experience> {
  return updateExperienceField(id, field, value);
}

export async function deleteExperienceById(id: string): Promise<void> {
  deleteExperience(id);
}

export { renderForSurface };

export async function exportLatex(experienceIds: string[]): Promise<string> {
  return renderForSurface(experienceIds, 'latex_bullets');
}

export async function tailorToJD(
  jobDescription: string,
  onProgress?: (status: string) => void
): Promise<{ snapshot: ApplicationSnapshot; selected: Experience[] }> {
  onProgress?.('Parsing job description...');
  const jd = await parseJobDescription(jobDescription);

  onProgress?.('Scoring experiences...');
  const all = listExperiences();
  const scored = scoreExperiences(all, jd);
  const selected = selectTopExperiences(scored);

  onProgress?.('Rendering surfaces...');
  const surfaces: Surface[] = [
    'resume_bullets',
    'linkedin_summary',
    'cover_letter_paragraph',
    'bio_short',
  ];

  const rendered: Partial<Record<Surface, string>> = {};
  for (const surface of surfaces) {
    rendered[surface] = await renderForSurface(
      selected.map((e) => e.id),
      surface,
      jobDescription
    );
    onProgress?.(`Rendered ${surface}`);
  }

  const gap = computeGapAnalysis(selected, jd);

  // Extract role/company from JD (best-effort)
  const roleMatch = jobDescription.match(/(?:role|position|title)[:\s]+([^\n.]+)/i);
  const companyMatch = jobDescription.match(/(?:at|company|organization)[:\s]+([^\n.]+)/i);
  const roleTitle = roleMatch ? roleMatch[1].trim() : 'Unknown Role';
  const company = companyMatch ? companyMatch[1].trim() : 'Unknown Company';

  const snapshot = saveSnapshot(roleTitle, company, jobDescription, jd, selected, rendered, gap);
  return { snapshot, selected };
}
