import type { Router } from 'express';
import { loadConfig } from '@seco/core';

export function registerConfigRoutes(router: Router): void {
  router.get('/health', (_req, res) => {
    const config = loadConfig();
    res.json({
      ok: true,
      version: '1.0.0',
      deepgramKeyAvailable: !!config.deepgramApiKey,
      whisperAvailable: !!config.openaiApiKey,
    });
  });

  router.get('/config', (_req, res) => {
    const config = loadConfig();
    res.json({
      deepgramKeyAvailable: !!config.deepgramApiKey,
      deepgramKey: config.deepgramApiKey,
      whisperAvailable: !!config.openaiApiKey,
    });
  });
}
