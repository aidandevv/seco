import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDir = join(tmpdir(), `seco-session-test-${Date.now()}`);
process.env['SECO_DIR'] = testDir;

import { createSession, getSession, appendToTranscript, addAssistantMessage, markSaved, markAbandoned, setAutoListenEnabled, clearSessionCacheForTests } from './session.js';
import { closeDb } from '../db/client.js';
import { createExperience } from '../experience/crud.js';
import { SecoError } from '../errors.js';

const sampleExp = {
  title: 'Test', organization: 'Org', role: 'Dev', role_type: 'project' as const,
  start_date: '2024-01-01', end_date: null, raw_transcript: 'test',
  situation: 's', task: 't', action: 'a', result: 'r',
  skills: [], impact_metrics: [], ats_keywords: [], tags: [],
};

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('createSession', () => {
  it('creates a session with status active', () => {
    const s = createSession();
    expect(s.id).toBeTruthy();
    expect(s.status).toBe('active');
    expect(s.mode).toBe('text');
    expect(s.auto_listen_enabled).toBe(false);
    expect(s.transcript).toBe('');
    expect(s.messages).toEqual([]);
  });

  it('persists voice mode and auto-listen preference', () => {
    const s = createSession('voice', { autoListenEnabled: true });
    expect(s.mode).toBe('voice');
    expect(s.auto_listen_enabled).toBe(true);
  });
});

describe('appendToTranscript', () => {
  it('appends text and adds a user message', () => {
    const s = createSession();
    appendToTranscript(s.id, 'Hello world');
    const updated = getSession(s.id);
    expect(updated.transcript).toBe('Hello world');
    expect(updated.messages).toEqual([{ role: 'user', content: 'Hello world' }]);
  });

  it('joins multiple appends with newline', () => {
    const s = createSession();
    appendToTranscript(s.id, 'First');
    appendToTranscript(s.id, 'Second');
    expect(getSession(s.id).transcript).toBe('First\nSecond');
  });

  it('rehydrates a persisted session if memory is empty', () => {
    const s = createSession();
    appendToTranscript(s.id, 'Persist me');
    clearSessionCacheForTests();
    const rehydrated = getSession(s.id);
    expect(rehydrated.transcript).toBe('Persist me');
    expect(rehydrated.messages).toEqual([{ role: 'user', content: 'Persist me' }]);
  });

  it('rehydrates mode and auto-listen preference', () => {
    const s = createSession('voice');
    setAutoListenEnabled(s.id, true);
    clearSessionCacheForTests();
    const rehydrated = getSession(s.id);
    expect(rehydrated.mode).toBe('voice');
    expect(rehydrated.auto_listen_enabled).toBe(true);
  });
});

describe('addAssistantMessage', () => {
  it('adds an assistant message without changing transcript', () => {
    const s = createSession();
    addAssistantMessage(s.id, 'Tell me more about that.');
    const updated = getSession(s.id);
    expect(updated.messages[0]).toEqual({ role: 'assistant', content: 'Tell me more about that.' });
    expect(updated.transcript).toBe('');
  });
});

describe('markSaved / markAbandoned', () => {
  it('markSaved sets status and experience_id', () => {
    const exp = createExperience(sampleExp);
    const s = createSession();
    markSaved(s.id, exp.id);
    const updated = getSession(s.id);
    expect(updated.status).toBe('saved');
    expect(updated.experience_id).toBe(exp.id);
  });

  it('markAbandoned removes session from memory', () => {
    const s = createSession();
    markAbandoned(s.id);
    expect(() => getSession(s.id)).toThrow(SecoError);
  });
});
