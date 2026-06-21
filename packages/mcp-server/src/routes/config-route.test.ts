import { describe, expect, it } from 'vitest';
import type { Router } from 'express';
import { registerConfigRoutes } from './config-route.js';

type Handler = (_req: unknown, res: { json: (value: unknown) => void }) => void;

function routeHandlers(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {};
  const router = {
    get(path: string, handler: Handler) {
      handlers[path] = handler;
      return router;
    },
  };
  registerConfigRoutes(router as unknown as Router);
  return handlers;
}

describe('config routes', () => {
  it('registers a health route with availability flags', () => {
    const handlers = routeHandlers();
    let body: unknown;
    handlers['/health']?.({}, { json: (value) => { body = value; } });
    expect(body).toMatchObject({
      ok: true,
      version: '1.0.0',
      deepgramKeyAvailable: expect.any(Boolean),
      whisperAvailable: expect.any(Boolean),
    });
  });
});
