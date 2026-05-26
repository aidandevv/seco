const BASE = '/api';

export interface Session {
  id: string;
  transcript: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  status: 'active' | 'saved' | 'abandoned';
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

export interface ConfigResponse {
  deepgramKeyAvailable: boolean;
  deepgramKey?: string;
  whisperAvailable: boolean;
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

export const api = {
  getConfig: () => get<ConfigResponse>('/config'),
  startSession: (mode: 'voice' | 'text') => post<Session>('/sessions', { mode }),
  appendTranscript: (id: string, text: string) =>
    post<{ ok: boolean }>(`/sessions/${id}/transcript`, { text }),
  saveSession: (id: string) => post<Experience>(`/sessions/${id}/save`),
  abandonSession: (id: string) => post<{ ok: boolean }>(`/sessions/${id}/abandon`),
  transcribeAudio: async (blob: Blob): Promise<string> => {
    const fd = new FormData();
    fd.append('file', blob, 'audio.webm');
    const res = await fetch(`${BASE}/audio/whisper`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`whisper failed: ${res.status}`);
    const data = (await res.json()) as { text: string };
    return data.text;
  },
};
