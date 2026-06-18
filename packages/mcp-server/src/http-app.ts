import express, { Router, type Express } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerAudioRoutes } from './routes/audio.js';
import { registerConfigRoutes } from './routes/config-route.js';

export interface HttpAppOptions {
  dev: boolean;
  webUiDist: string;
  log: (message: string) => void;
}

export interface HttpAppSetup {
  webUiBuilt: boolean;
  webUiIndex: string;
}

export function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

export function shouldServeSpaFallback(path: string): boolean {
  return !isApiPath(path) && path !== '/ws';
}

export function configureHttpApp(app: Express, options: HttpAppOptions): HttpAppSetup {
  app.use(express.json());
  if (options.dev) {
    app.use((req, _res, next) => {
      options.log(`  ${req.method} ${req.path}\n`);
      next();
    });
  }

  const router = Router();
  registerSessionRoutes(router);
  registerAudioRoutes(router);
  registerConfigRoutes(router);
  app.use(router);
  app.use('/api', router);

  const webUiIndex = join(options.webUiDist, 'index.html');
  const webUiBuilt = existsSync(webUiIndex);
  if (webUiBuilt) {
    app.use(express.static(options.webUiDist));
    app.get('*', (req, res, next) => {
      if (isApiPath(req.path)) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      if (!shouldServeSpaFallback(req.path)) {
        next();
        return;
      }
      res.sendFile(webUiIndex);
    });
  } else {
    options.log('  Guided intake UI: not built - run: npm run build --workspace=packages/web-ui\n');
  }

  return { webUiBuilt, webUiIndex };
}
