import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket, WebSocketServer } from 'ws';
import { registerWsHandlers } from './ws.js';
import { appendTranscript, getIntakeDraft, getIntakeSession, getNextIntakeTurn } from '@seco/core';
import type { ExperienceDraft, IntakeSession } from '@seco/core';

vi.mock('@seco/core', () => ({
  appendTranscript: vi.fn().mockResolvedValue(undefined),
  getIntakeDraft: vi.fn(),
  getIntakeSession: vi.fn().mockReturnValue({ messages: [] }),
  getNextIntakeTurn: vi.fn(),
}));

const draft: ExperienceDraft = {
  title: 'Pipeline',
  organization: 'Acme',
  role: 'Engineer',
  role_type: 'project',
  start_date: '2024-01-01',
  end_date: null,
  situation: 'Situation',
  task: 'Task',
  action: 'Action',
  result: 'Result',
  skills: ['Kafka'],
  impact_metrics: ['60% faster'],
  ats_keywords: [],
  tags: [],
  fieldConfidence: {},
  overallConfidence: 'high',
  missingFields: [],
  readyForReview: true,
};

class FakeSocket extends EventEmitter {
  public sent: Array<Record<string, unknown>> = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
}

function setupSocket(): FakeSocket {
  const wss = new EventEmitter() as WebSocketServer;
  const socket = new FakeSocket();
  registerWsHandlers(wss);
  wss.emit('connection', socket as unknown as WebSocket);
  return socket;
}

function sessionWithMessages(messages: IntakeSession['messages']): IntakeSession {
  return {
    id: 'sess-1',
    messages,
    status: 'active',
    mode: 'text',
    auto_listen_enabled: false,
    transcript: '',
    experience_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

async function waitForType(socket: FakeSocket, type: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (socket.sent.some((message) => message['type'] === type)) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

describe('registerWsHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIntakeSession).mockReturnValue(sessionWithMessages([]));
  });

  it('emits draft_update before the next question', async () => {
    vi.mocked(getNextIntakeTurn).mockResolvedValue({
      text: 'What result did that create?',
      draft: { ...draft, readyForReview: false, missingFields: ['result'] },
      lifecycle: 'needs_details',
      complete: false,
    });
    const socket = setupSocket();

    socket.emit('message', JSON.stringify({ type: 'utterance', sessionId: 'sess-1', text: 'I built a pipeline.' }));
    await waitForType(socket, 'question_complete');

    expect(appendTranscript).toHaveBeenCalledWith('sess-1', 'I built a pipeline.');
    expect(socket.sent.map((message) => message['type'])).toEqual([
      'status',
      'draft_update',
      'question',
      'question_complete',
      'status',
    ]);
  });

  it('emits review_ready without saving when the draft is complete', async () => {
    vi.mocked(getNextIntakeTurn).mockResolvedValue({
      text: '',
      draft,
      lifecycle: 'ready_for_review',
      complete: true,
    });
    const socket = setupSocket();

    socket.emit('message', JSON.stringify({ type: 'utterance', sessionId: 'sess-1', text: 'That is the result.' }));
    await waitForType(socket, 'review_ready');

    expect(socket.sent.map((message) => message['type'])).toEqual([
      'status',
      'draft_update',
      'review_ready',
      'status',
    ]);
    expect(socket.sent.find((message) => message['type'] === 'review_ready')?.['draft']).toEqual(draft);
  });

  it('does not duplicate an assistant question on reconnect init', async () => {
    vi.mocked(getIntakeSession).mockReturnValueOnce(sessionWithMessages([{ role: 'assistant', content: 'Existing question?' }]));
    vi.mocked(getIntakeDraft).mockResolvedValueOnce({ ...draft, readyForReview: false, missingFields: ['result'] });
    const socket = setupSocket();

    socket.emit('message', JSON.stringify({ type: 'init', sessionId: 'sess-1' }));
    await waitForType(socket, 'draft_update');

    expect(getNextIntakeTurn).not.toHaveBeenCalled();
    expect(socket.sent.map((message) => message['type'])).toEqual(['draft_update', 'status']);
  });

  it('sends an actionable error instead of raw provider details', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.mocked(getNextIntakeTurn).mockRejectedValueOnce(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'));
    const socket = setupSocket();

    try {
      socket.emit('message', JSON.stringify({ type: 'init', sessionId: 'sess-1' }));
      await waitForType(socket, 'error');

      const error = socket.sent.find((message) => message['type'] === 'error');
      expect(error?.['message']).toContain('Check ANTHROPIC_API_KEY');
      expect(error?.['message']).not.toContain('invalid x-api-key');
      expect(error?.['message']).not.toContain('authentication_error');
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
