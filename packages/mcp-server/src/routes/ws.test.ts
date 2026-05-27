import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket, WebSocketServer } from 'ws';
import { registerWsHandlers } from './ws.js';
import { appendTranscript, getNextIntakeTurn } from '@seco/core';
import type { ExperienceDraft } from '@seco/core';

vi.mock('@seco/core', () => ({
  appendTranscript: vi.fn().mockResolvedValue(undefined),
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

async function waitForType(socket: FakeSocket, type: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (socket.sent.some((message) => message['type'] === type)) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

describe('registerWsHandlers', () => {
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
});
