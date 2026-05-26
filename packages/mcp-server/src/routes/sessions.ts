import type { Router } from 'express';
import {
  createIntakeSession,
  appendTranscript,
  getNextQuestion,
  saveSession,
  abandonSession,
  getIntakeSession,
} from '@seco/core';

export function registerSessionRoutes(router: Router): void {
  router.get('/sessions/:id', (req, res) => {
    const session = getIntakeSession(req.params['id']!);
    if (!session) { res.status(404).json({ error: 'session not found' }); return; }
    res.json(session);
  });

  router.post('/sessions', (req, res) => {
    try {
      const mode = (req.body as { mode?: string }).mode === 'voice' ? 'voice' : 'text';
      const session = createIntakeSession(mode);
      res.json(session);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.post('/sessions/:id/transcript', async (req, res) => {
    try {
      const { text } = req.body as { text: string };
      await appendTranscript(req.params['id']!, text);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // SSE streaming endpoint
  router.get('/sessions/:id/question', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      await getNextQuestion(req.params['id']!, (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: String(e) })}\n\n`);
      res.end();
    }
  });

  router.post('/sessions/:id/save', async (req, res) => {
    try {
      const experience = await saveSession(req.params['id']!);
      res.json(experience);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.post('/sessions/:id/abandon', async (req, res) => {
    try {
      await abandonSession(req.params['id']!);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
