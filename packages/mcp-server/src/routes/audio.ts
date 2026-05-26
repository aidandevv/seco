import type { Router } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { loadConfig } from '@seco/core';
import { Readable } from 'node:stream';

const upload = multer({ storage: multer.memoryStorage() });

export function registerAudioRoutes(router: Router): void {
  router.post(
    '/audio/whisper',
    upload.single('file'),
    async (req, res) => {
      const config = loadConfig();
      if (!config.openaiApiKey) {
        res.status(400).json({ error: 'OPENAI_API_KEY not configured' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No audio file provided' });
        return;
      }

      try {
        const openai = new OpenAI({ apiKey: config.openaiApiKey });
        const readable = Readable.from(req.file.buffer);
        const file = await OpenAI.toFile(readable, 'audio.webm', { type: 'audio/webm' });
        const transcription = await openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
        });
        res.json({ text: transcription.text });
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    }
  );
}
