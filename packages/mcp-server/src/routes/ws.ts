import type { WebSocketServer, WebSocket } from 'ws';
import { appendTranscript, getNextIntakeTurn } from '@seco/core';

type IncomingMessage =
  | { type: 'init'; sessionId: string }
  | { type: 'utterance'; sessionId: string; text: string };

async function streamQuestion(ws: WebSocket, sessionId: string): Promise<void> {
  ws.send(JSON.stringify({ type: 'status', status: 'thinking' }));
  const turn = await getNextIntakeTurn(sessionId);
  ws.send(JSON.stringify({
    type: 'draft_update',
    draft: turn.draft,
    lifecycle: turn.lifecycle,
  }));

  if (turn.complete) {
    ws.send(JSON.stringify({
      type: 'review_ready',
      draft: turn.draft,
      lifecycle: 'ready_for_review',
    }));
    ws.send(JSON.stringify({ type: 'status', status: 'ready_for_review' }));
    return;
  }

  ws.send(JSON.stringify({ type: 'question', text: turn.text }));
  ws.send(JSON.stringify({ type: 'question_complete', text: turn.text }));
  ws.send(JSON.stringify({ type: 'status', status: 'ready' }));
}

export function registerWsHandlers(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (data) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(data.toString()) as IncomingMessage;
      } catch {
        return;
      }

      try {
        if (msg.type === 'init' && msg.sessionId) {
          await streamQuestion(ws, msg.sessionId);
        } else if (msg.type === 'utterance' && msg.sessionId && msg.text) {
          await appendTranscript(msg.sessionId, msg.text);
          await streamQuestion(ws, msg.sessionId);
        }
      } catch (e) {
        process.stderr.write(`  ws error: ${String(e)}\n`);
        ws.send(JSON.stringify({ type: 'status', status: 'idle' }));
        ws.send(JSON.stringify({ type: 'error', message: String(e) }));
      }
    });
  });
}
