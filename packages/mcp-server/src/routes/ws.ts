import type { WebSocketServer, WebSocket } from 'ws';
import { appendTranscript, getNextQuestion } from '@seco/core';

type IncomingMessage =
  | { type: 'init'; sessionId: string }
  | { type: 'utterance'; sessionId: string; text: string };

async function streamQuestion(ws: WebSocket, sessionId: string): Promise<void> {
  ws.send(JSON.stringify({ type: 'status', status: 'thinking' }));
  let fullQuestion = '';
  await getNextQuestion(sessionId, (chunk) => {
    fullQuestion += chunk;
    ws.send(JSON.stringify({ type: 'question', text: chunk }));
  });
  ws.send(JSON.stringify({ type: 'question_complete', text: fullQuestion }));
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
