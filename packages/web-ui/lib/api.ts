const BASE = '/api';

export interface Session {
  id: string;
  transcript: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  status: 'active' | 'saved' | 'abandoned';
  mode: 'voice' | 'text';
  auto_listen_enabled: boolean;
  experience_id: string | null;
}

export interface Experience {
  id: string;
  title: string;
  organization: string;
  role: string;
  role_type: string;
  start_date: string;
  end_date: string | null;
  skills: string[];
  impact_metrics: string[];
  tags: string[];
  version: number;
}

export type DraftFieldConfidence = 'low' | 'medium' | 'high';
export type IntakeLifecycle = 'collecting' | 'needs_details' | 'ready_for_review' | 'saved';

export interface ExperienceDraft {
  title: string;
  organization: string;
  role: string;
  role_type: 'internship' | 'full-time' | 'project' | 'leadership' | 'research';
  start_date: string;
  end_date: string | null;
  situation: string;
  task: string;
  action: string;
  result: string;
  skills: string[];
  impact_metrics: string[];
  ats_keywords: string[];
  tags: string[];
  fieldConfidence: Partial<Record<string, DraftFieldConfidence>>;
  fieldNotes?: Partial<Record<string, string>>;
  qualityScore?: { star: number; metrics: number; skills: number; overall: number };
  overallConfidence: DraftFieldConfidence;
  missingFields: string[];
  readyForReview: boolean;
}

export interface CompletedIntake {
  experience: Experience;
  summary: string;
}

export interface IntakeSessionResult {
  session: Session;
  lifecycle: IntakeLifecycle;
  draft?: ExperienceDraft;
  experience?: Experience;
  summary?: string;
}

export interface ConfigResponse {
  deepgramKeyAvailable: boolean;
  deepgramKey?: string;
  whisperAvailable: boolean;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  deepgramKeyAvailable: boolean;
  whisperAvailable: boolean;
}

function audioFilename(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'audio.mp4';
  if (mimeType.includes('mpeg')) return 'audio.mp3';
  if (mimeType.includes('ogg')) return 'audio.ogg';
  if (mimeType.includes('wav')) return 'audio.wav';
  return 'audio.webm';
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getHealth: () => get<HealthResponse>('/health'),
  getConfig: () => get<ConfigResponse>('/config'),
  startSession: (mode: 'voice' | 'text') => post<Session>('/sessions', { mode }),
  getSession: (id: string) => get<Session>(`/sessions/${id}`),
  getDraft: (id: string) => get<ExperienceDraft>(`/sessions/${id}/draft`),
  getSessionResult: (id: string) => get<IntakeSessionResult>(`/sessions/${id}/result`),
  appendTranscript: (id: string, text: string) =>
    post<{ ok: boolean }>(`/sessions/${id}/transcript`, { text }),
  saveSession: (id: string) => post<Experience>(`/sessions/${id}/save`),
  saveReviewedSession: (id: string, draft: ExperienceDraft) =>
    post<CompletedIntake>(`/sessions/${id}/review/save`, { draft }),
  updateSessionPreferences: (id: string, preferences: { auto_listen_enabled: boolean }) =>
    patch<Session>(`/sessions/${id}/preferences`, preferences),
  abandonSession: (id: string) => post<{ ok: boolean }>(`/sessions/${id}/abandon`),
  transcribeAudio: async (blob: Blob): Promise<string> => {
    const fd = new FormData();
    fd.append('file', blob, audioFilename(blob.type));
    const res = await fetch(`${BASE}/audio/whisper`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`whisper failed: ${res.status}`);
    const data = (await res.json()) as { text: string };
    return data.text;
  },
};
