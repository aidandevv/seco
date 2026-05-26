import type { Router } from 'express';
import { loadConfig } from '@seco/core';

export function registerConfigRoutes(router: Router): void {
  router.get('/config', (_req, res) => {
    const config = loadConfig();
    res.json({
      deepgramKeyAvailable: !!config.deepgramApiKey,
      deepgramKey: config.deepgramApiKey,
      whisperAvailable: !!config.openaiApiKey,
    });
  });
}
