import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { SecoError } from '../errors.js';
import type { IntakeSession } from '../experience/types.js';

interface SessionState extends IntakeSession {}
type SessionRow = {
  id: string;
  transcript: string;
  messages: string;
  status: string;
  experience_id: string | null;
  created_at: string;
  updated_at: string;
};

const sessions = new Map<string, SessionState>();

export function clearSessionCacheForTests(): void {
  sessions.clear();
}

function isSessionStatus(status: string): status is IntakeSession['status'] {
  return status === 'active' || status === 'saved' || status === 'abandoned';
}

function parseMessages(value: string): IntakeSession['messages'] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((message): message is { role: 'user' | 'assistant'; content: string } => {
      if (!message || typeof message !== 'object') return false;
      const record = message as Record<string, unknown>;
      return (record['role'] === 'user' || record['role'] === 'assistant') && typeof record['content'] === 'string';
    });
  } catch {
    return [];
  }
}

function loadPersistedSession(id: string): SessionState | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM intake_sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!row || !isSessionStatus(row.status)) return null;
  if (row.status === 'abandoned') return null;
  const session: SessionState = {
    id: row.id,
    transcript: row.transcript,
    messages: parseMessages(row.messages),
    status: row.status,
    experience_id: row.experience_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  sessions.set(session.id, session);
  return session;
}

export function createSession(): IntakeSession {
  const now = new Date().toISOString();
  const session: SessionState = {
    id: randomUUID(),
    transcript: '',
    messages: [],
    status: 'active',
    experience_id: null,
    created_at: now,
    updated_at: now,
  };
  sessions.set(session.id, session);
  persistSession(session);
  return { ...session };
}

export function getSession(id: string): SessionState {
  const session = sessions.get(id) ?? loadPersistedSession(id);
  if (!session) throw new SecoError('SESSION_NOT_FOUND', id);
  return session;
}

export function appendToTranscript(id: string, text: string): void {
  const session = getSession(id);
  session.transcript = session.transcript ? `${session.transcript}\n${text}` : text;
  session.messages.push({ role: 'user', content: text });
  session.updated_at = new Date().toISOString();
  persistSession(session);
}

export function addAssistantMessage(id: string, text: string): void {
  const session = getSession(id);
  session.messages.push({ role: 'assistant', content: text });
  session.updated_at = new Date().toISOString();
  persistSession(session);
}

export function markSaved(id: string, experienceId: string): void {
  const session = getSession(id);
  session.status = 'saved';
  session.experience_id = experienceId;
  session.updated_at = new Date().toISOString();
  persistSession(session);
}

export function markAbandoned(id: string): void {
  const session = getSession(id);
  session.status = 'abandoned';
  session.updated_at = new Date().toISOString();
  persistSession(session);
  sessions.delete(id);
}

function persistSession(session: SessionState): void {
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM intake_sessions WHERE id = ?').get(session.id);
  if (exists) {
    db.prepare(
      'UPDATE intake_sessions SET transcript = ?, messages = ?, status = ?, experience_id = ?, updated_at = ? WHERE id = ?'
    ).run(
      session.transcript,
      JSON.stringify(session.messages),
      session.status,
      session.experience_id,
      session.updated_at,
      session.id
    );
  } else {
    db.prepare(
      'INSERT INTO intake_sessions (id, transcript, messages, status, experience_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      session.id,
      session.transcript,
      JSON.stringify(session.messages),
      session.status,
      session.experience_id,
      session.created_at,
      session.updated_at
    );
  }
}
