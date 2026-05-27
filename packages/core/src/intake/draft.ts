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
Shape:
{"title":"","organization":"","role":"","role_type":"project","start_date":"","end_date":null,"situation":"","task":"","action":"","result":"","skills":[],"impact_metrics":[],"ats_keywords":[],"tags":[],"fieldConfidence":{}}`;

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
    overallConfidence: 'low',
    missingFields: REQUIRED_FIELDS,
    readyForReview: false,
  };
}

export function normalizeExperienceDraft(value: unknown): ExperienceDraft {
  const record = asRecord(value);
  const confidenceRecord = asRecord(record['fieldConfidence']);
  const fieldConfidence: Partial<Record<ExperienceDraftField, DraftFieldConfidence>> = {};
  for (const field of DRAFT_FIELDS) {
    fieldConfidence[field] = confidenceValue(confidenceRecord[field]);
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
    setCachedDraft(sessionId, draft);
    return draft;
  } catch {
    const fallback = previousDraft ?? createEmptyExperienceDraft();
    setCachedDraft(sessionId, fallback);
    return fallback;
  }
}
