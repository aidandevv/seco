import { createSession, getSession, appendToTranscript, addAssistantMessage, markSaved, markAbandoned } from './intake/session.js';
import { generateNextQuestion, hasCompletionMarker, stripCompletionMarker } from './intake/questions.js';
import {
  createEmptyExperienceDraft,
  extractExperienceDraft,
  getCachedDraft,
  lifecycleForDraft,
  normalizeExperienceDraft,
  setCachedDraft,
} from './intake/draft.js';
import { extractSTAR } from './intake/extractor.js';
import { createExperience, getExperience, listExperiences, updateExperienceField, deleteExperience } from './experience/crud.js';
import { renderForSurface } from './render/index.js';
import { parseJobDescription } from './tailor/parser.js';
import { scoreExperiences, selectTopExperiences } from './tailor/scorer.js';
import { computeGapAnalysis, saveSnapshot } from './tailor/snapshot.js';
import { SecoError } from './errors.js';
import type { Experience, ExperienceDraft, IntakeLifecycle, IntakeSession, ApplicationSnapshot, Surface, RoleType } from './experience/types.js';

export type { Experience, ExperienceDraft, IntakeLifecycle, IntakeSession, ApplicationSnapshot, Surface, RoleType };
export { SecoError };
export { loadConfig, validateConfig, runFirstTimeSetup } from './config/keys.js';

export interface IntakeTurnResult {
  text: string;
  draft: ExperienceDraft;
  lifecycle: IntakeLifecycle;
  complete: boolean;
}

export interface CompletedIntake {
  experience: Experience;
  summary: string;
}

export interface IntakeSessionResult {
  session: IntakeSession;
  lifecycle: IntakeLifecycle;
  draft?: ExperienceDraft;
  experience?: Experience;
  summary?: string;
}

export interface IntakeSessionResultOptions {
  refreshDraft?: boolean;
}

function buildExperienceSummary(experience: Experience): string {
  return [
    `Experience ID: ${experience.id}`,
    `Title: ${experience.title}`,
    `Organization: ${experience.organization}`,
    `Role: ${experience.role}`,
    `Dates: ${experience.start_date}${experience.end_date ? ` to ${experience.end_date}` : ' to present'}`,
    `Situation: ${experience.situation}`,
    `Task: ${experience.task}`,
    `Action: ${experience.action}`,
    `Result: ${experience.result}`,
    `Skills: ${experience.skills.join(', ') || 'None captured'}`,
    `Impact metrics: ${experience.impact_metrics.join(', ') || 'None captured'}`,
  ].join('\n');
}

export async function startIntakeSession(_mode: 'voice' | 'text'): Promise<IntakeSession> {
  const session = createSession();
  const question = await generateNextQuestion([], createEmptyExperienceDraft());
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
  const result = await getNextIntakeTurn(sessionId);
  onChunk?.(result.text);
  return result.text;
}

export async function getNextIntakeTurn(sessionId: string): Promise<IntakeTurnResult> {
  const session = getSession(sessionId);
  const draft = await updateIntakeDraft(sessionId);
  const lifecycle = lifecycleForDraft(draft);
  if (lifecycle === 'ready_for_review') {
    return { text: '', draft, lifecycle, complete: true };
  }
  const response = await generateNextQuestion(session.messages, draft);
  const text = stripCompletionMarker(response);
  addAssistantMessage(sessionId, text);
  const complete = hasCompletionMarker(response);
  return {
    text,
    draft,
    lifecycle: complete ? 'ready_for_review' : lifecycle,
    complete,
  };
}

export async function saveSession(sessionId: string): Promise<Experience> {
  const session = getSession(sessionId);
  if (session.status === 'saved' && session.experience_id) {
    return getExperience(session.experience_id);
  }
  const extracted = await extractSTAR(session.transcript);
  const experience = createExperience({ ...extracted, raw_transcript: session.transcript });
  markSaved(sessionId, experience.id);
  return experience;
}

export async function completeIntakeSession(sessionId: string): Promise<CompletedIntake> {
  const experience = await saveSession(sessionId);
  return { experience, summary: buildExperienceSummary(experience) };
}

export async function updateIntakeDraft(sessionId: string): Promise<ExperienceDraft> {
  const session = getSession(sessionId);
  return extractExperienceDraft(sessionId, session.transcript, session.messages);
}

export async function getIntakeDraft(sessionId: string): Promise<ExperienceDraft> {
  const session = getSession(sessionId);
  return getCachedDraft(sessionId)
    ?? extractExperienceDraft(sessionId, session.transcript, session.messages);
}

function validateReviewedDraft(draft: ExperienceDraft): void {
  const missing = ['title', 'organization', 'role', 'start_date', 'situation', 'task', 'action', 'result']
    .filter((field) => !String(draft[field as keyof ExperienceDraft] ?? '').trim());
  if (missing.length > 0) {
    throw new SecoError('INVALID_DRAFT', `Missing required fields: ${missing.join(', ')}`);
  }
}

export async function saveReviewedIntakeSession(
  sessionId: string,
  reviewedDraft: unknown
): Promise<CompletedIntake> {
  const session = getSession(sessionId);
  if (session.status === 'saved' && session.experience_id) {
    const experience = getExperience(session.experience_id);
    return { experience, summary: buildExperienceSummary(experience) };
  }

  const draft = normalizeExperienceDraft(reviewedDraft);
  validateReviewedDraft(draft);
  setCachedDraft(sessionId, draft);
  const experience = createExperience({
    title: draft.title,
    organization: draft.organization,
    role: draft.role,
    role_type: draft.role_type,
    start_date: draft.start_date,
    end_date: draft.end_date,
    raw_transcript: session.transcript,
    situation: draft.situation,
    task: draft.task,
    action: draft.action,
    result: draft.result,
    skills: draft.skills,
    impact_metrics: draft.impact_metrics,
    ats_keywords: draft.ats_keywords,
    tags: draft.tags,
  });
  markSaved(sessionId, experience.id);
  return { experience, summary: buildExperienceSummary(experience) };
}

export async function getIntakeSessionResult(
  sessionId: string,
  options: IntakeSessionResultOptions = {}
): Promise<IntakeSessionResult> {
  const session = getSession(sessionId);
  if (session.status === 'saved' && session.experience_id) {
    const experience = getExperience(session.experience_id);
    return {
      session,
      lifecycle: 'saved',
      experience,
      summary: buildExperienceSummary(experience),
    };
  }

  const draft = options.refreshDraft
    ? await getIntakeDraft(sessionId)
    : getCachedDraft(sessionId) ?? createEmptyExperienceDraft();
  return {
    session,
    lifecycle: lifecycleForDraft(draft),
    draft,
  };
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
