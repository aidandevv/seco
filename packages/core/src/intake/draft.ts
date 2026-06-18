import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config/keys.js';
import type {
  DraftFieldConfidence,
  ExperienceDraft,
  ExperienceDraftField,
  IntakeLifecycle,
  RoleType,
} from '../experience/types.js';

export const DRAFT_EXTRACTOR_MODEL = 'claude-haiku-4-5';
const DRAFT_EXTRACTOR_MAX_TOKENS = 900;

const VALID_ROLE_TYPES: RoleType[] = ['internship', 'full-time', 'project', 'leadership', 'research'];
const REQUIRED_FIELDS: ExperienceDraftField[] = [
  'title',
  'organization',
  'role',
  'start_date',
  'situation',
  'task',
  'action',
  'result',
];
const DRAFT_FIELDS: ExperienceDraftField[] = [
  ...REQUIRED_FIELDS,
  'role_type',
  'end_date',
  'skills',
  'impact_metrics',
  'ats_keywords',
  'tags',
];

const SYSTEM = `Extract the current professional experience draft from the conversation.
Return compact JSON only, no markdown. Preserve corrections from the latest user message.
Use empty strings or empty arrays for unknown fields. Use null for unknown end_date.
role_type must be one of: internship, full-time, project, leadership, research.
fieldConfidence values must be low, medium, or high.
fieldNotes values should be short plain-text reasons when a field is missing, vague, or corrected.
Shape:
{"title":"","organization":"","role":"","role_type":"project","start_date":"","end_date":null,"situation":"","task":"","action":"","result":"","skills":[],"impact_metrics":[],"ats_keywords":[],"tags":[],"fieldConfidence":{},"fieldNotes":{}}`;

const draftCache = new Map<string, ExperienceDraft>();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableStringValue(value: unknown): string | null {
  const text = stringValue(value);
  return text ? text : null;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
}

function confidenceValue(value: unknown): DraftFieldConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function roleTypeValue(value: unknown): RoleType {
  const roleType = stringValue(value) as RoleType;
  return VALID_ROLE_TYPES.includes(roleType) ? roleType : 'project';
}

export function createEmptyExperienceDraft(): ExperienceDraft {
  const fieldConfidence: Partial<Record<ExperienceDraftField, DraftFieldConfidence>> = {};
  for (const field of DRAFT_FIELDS) fieldConfidence[field] = 'low';
  return {
    title: '',
    organization: '',
    role: '',
    role_type: 'project',
    start_date: '',
    end_date: null,
    situation: '',
    task: '',
    action: '',
    result: '',
    skills: [],
    impact_metrics: [],
    ats_keywords: [],
    tags: [],
    fieldConfidence,
    fieldNotes: {},
    qualityScore: { star: 0, metrics: 0, skills: 0, overall: 0 },
    overallConfidence: 'low',
    missingFields: REQUIRED_FIELDS,
    readyForReview: false,
  };
}

function qualityScore(draft: Pick<ExperienceDraft, 'situation' | 'task' | 'action' | 'result' | 'impact_metrics' | 'skills' | 'ats_keywords'>): ExperienceDraft['qualityScore'] {
  const starFields = [draft.situation, draft.task, draft.action, draft.result]
    .filter((value) => value.trim().length >= 20).length;
  const star = Math.round((starFields / 4) * 100);
  const metrics = Math.min(100, draft.impact_metrics.length * 50);
  const skills = Math.min(100, (draft.skills.length + draft.ats_keywords.length) * 20);
  return {
    star,
    metrics,
    skills,
    overall: Math.round((star * 0.55) + (metrics * 0.25) + (skills * 0.20)),
  };
}

function defaultFieldNotes(draft: ExperienceDraft): Partial<Record<ExperienceDraftField, string>> {
  const notes: Partial<Record<ExperienceDraftField, string>> = {};
  for (const field of REQUIRED_FIELDS) {
    const value = draft[field];
    if (typeof value === 'string' && !value.trim()) notes[field] = `${field.replace('_', ' ')} is missing`;
    else if (draft.fieldConfidence[field] === 'low') notes[field] = `${field.replace('_', ' ')} needs more detail`;
  }
  if (draft.impact_metrics.length === 0) notes.impact_metrics = 'Add at least one measurable result or concrete outcome';
  if (draft.skills.length === 0) notes.skills = 'Add the tools, methods, or skills used';
  return notes;
}

export function applyConversationalCorrections(
  draft: ExperienceDraft,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): void {
  const latest = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const patterns: Array<[RegExp, ExperienceDraftField, string]> = [
    [/\b(?:change|set|update)\s+(?:the\s+)?(?:company|organization|org)\s+to\s+(.+?)[.!?]?$/i, 'organization', 'Updated organization'],
    [/\b(?:change|set|update)\s+(?:the\s+)?title\s+to\s+(.+?)[.!?]?$/i, 'title', 'Updated title'],
    [/\b(?:change|set|update)\s+(?:the\s+)?role\s+to\s+(.+?)[.!?]?$/i, 'role', 'Updated role'],
    [/\b(?:change|set|update)\s+(?:the\s+)?start\s+date\s+to\s+(.+?)[.!?]?$/i, 'start_date', 'Updated start date'],
    [/\b(?:change|set|update)\s+(?:the\s+)?end\s+date\s+to\s+(.+?)[.!?]?$/i, 'end_date', 'Updated end date'],
  ];

  for (const [pattern, field, note] of patterns) {
    const match = latest.match(pattern);
    const value = match?.[1]?.trim();
    if (!value) continue;
    if (field === 'title') draft.title = value;
    else if (field === 'organization') draft.organization = value;
    else if (field === 'role') draft.role = value;
    else if (field === 'start_date') draft.start_date = value;
    else if (field === 'end_date') {
      draft.end_date = value;
    }
    draft.fieldConfidence[field] = 'high';
    draft.fieldNotes = { ...(draft.fieldNotes ?? {}), [field]: note };
  }
}

export function normalizeExperienceDraft(value: unknown): ExperienceDraft {
  const record = asRecord(value);
  const confidenceRecord = asRecord(record['fieldConfidence']);
  const noteRecord = asRecord(record['fieldNotes']);
  const fieldConfidence: Partial<Record<ExperienceDraftField, DraftFieldConfidence>> = {};
  const fieldNotes: Partial<Record<ExperienceDraftField, string>> = {};
  for (const field of DRAFT_FIELDS) {
    fieldConfidence[field] = confidenceValue(confidenceRecord[field]);
    const note = stringValue(noteRecord[field]);
    if (note) fieldNotes[field] = note;
  }

  const draft: ExperienceDraft = {
    title: stringValue(record['title']),
    organization: stringValue(record['organization']),
    role: stringValue(record['role']),
    role_type: roleTypeValue(record['role_type']),
    start_date: stringValue(record['start_date']),
    end_date: nullableStringValue(record['end_date']),
    situation: stringValue(record['situation']),
    task: stringValue(record['task']),
    action: stringValue(record['action']),
    result: stringValue(record['result']),
    skills: stringArrayValue(record['skills']),
    impact_metrics: stringArrayValue(record['impact_metrics']),
    ats_keywords: stringArrayValue(record['ats_keywords']),
    tags: stringArrayValue(record['tags']),
    fieldConfidence,
    fieldNotes,
    qualityScore: { star: 0, metrics: 0, skills: 0, overall: 0 },
    overallConfidence: 'low',
    missingFields: [],
    readyForReview: false,
  };

  const missingFields = REQUIRED_FIELDS.filter((field) => {
    const valueForField = draft[field];
    const hasValue = typeof valueForField === 'string' ? valueForField.length > 0 : valueForField !== null;
    return !hasValue || draft.fieldConfidence[field] === 'low';
  });
  const hasImpactDetail = draft.skills.length > 0 || draft.impact_metrics.length > 0;
  if (!hasImpactDetail) missingFields.push('impact_metrics');

  draft.missingFields = [...new Set(missingFields)];
  draft.readyForReview = draft.missingFields.length === 0;
  draft.fieldNotes = { ...defaultFieldNotes(draft), ...(draft.fieldNotes ?? {}) };
  draft.qualityScore = qualityScore(draft);
  draft.overallConfidence = draft.readyForReview
    ? 'high'
    : draft.missingFields.length <= 3
      ? 'medium'
      : 'low';

  return draft;
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed) as unknown;
}

export function getCachedDraft(sessionId: string): ExperienceDraft | null {
  return draftCache.get(sessionId) ?? null;
}

export function setCachedDraft(sessionId: string, draft: ExperienceDraft): void {
  draftCache.set(sessionId, draft);
}

export function lifecycleForDraft(draft: ExperienceDraft): IntakeLifecycle {
  if (draft.readyForReview) return 'ready_for_review';
  return draft.overallConfidence === 'low' ? 'collecting' : 'needs_details';
}

export interface NextDraftQuestionTarget {
  field: ExperienceDraftField;
  prompt: string;
}

const TARGET_PROMPTS: Record<ExperienceDraftField, string> = {
  title: 'What should we call this experience?',
  organization: 'What organization, team, or context was this for?',
  role: 'What was your role or responsibility in this experience?',
  role_type: 'What type of experience was this?',
  start_date: 'When did this experience start?',
  end_date: 'When did this experience end, or is it still ongoing?',
  situation: 'What was the situation or context before your work began?',
  task: 'What were you responsible for solving or delivering?',
  action: 'What specific actions did you personally take?',
  result: 'What changed because of your work?',
  skills: 'What tools, skills, or methods did you use?',
  impact_metrics: 'What measurable result, scale, or concrete outcome can we capture?',
  ats_keywords: 'What keywords should this experience be associated with?',
  tags: 'What tags would help you find this experience later?',
};

export function getNextDraftQuestionTarget(draft: ExperienceDraft): NextDraftQuestionTarget | null {
  const priority: ExperienceDraftField[] = [
    'title',
    'organization',
    'role',
    'start_date',
    'situation',
    'task',
    'action',
    'result',
    'impact_metrics',
    'skills',
  ];
  const field = priority.find((candidate) => draft.missingFields.includes(candidate));
  return field ? { field, prompt: TARGET_PROMPTS[field] } : null;
}

export async function extractExperienceDraft(
  sessionId: string,
  transcript: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<ExperienceDraft> {
  const previousDraft = getCachedDraft(sessionId);
  if (!transcript.trim()) {
    const empty = previousDraft ?? createEmptyExperienceDraft();
    setCachedDraft(sessionId, empty);
    return empty;
  }

  try {
    const config = loadConfig();
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const response = await client.messages.create({
      model: DRAFT_EXTRACTOR_MODEL,
      max_tokens: DRAFT_EXTRACTOR_MAX_TOKENS,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: JSON.stringify({
          transcript,
          messages,
          previousDraft: previousDraft ?? createEmptyExperienceDraft(),
        }),
      }],
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected non-text draft response');
    const draft = normalizeExperienceDraft(parseJsonObject(block.text));
    applyConversationalCorrections(draft, messages);
    draft.missingFields = normalizeExperienceDraft(draft).missingFields;
    draft.readyForReview = draft.missingFields.length === 0;
    draft.qualityScore = qualityScore(draft);
    setCachedDraft(sessionId, draft);
    return draft;
  } catch {
    const fallback = previousDraft ?? createEmptyExperienceDraft();
    setCachedDraft(sessionId, fallback);
    return fallback;
  }
}
