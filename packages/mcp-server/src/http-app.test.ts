import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configureHttpApp, isApiPath, shouldServeSpaFallback } from './http-app.js';

const tempDirs: string[] = [];

type ExpressLayer = {
  name?: string;
  regexp?: RegExp;
  route?: { path?: string };
};

function stack(app: express.Express): ExpressLayer[] {
  return ((app as unknown as { _router?: { stack?: ExpressLayer[] } })._router?.stack ?? []);
}

function createStaticUi(): string {
  const dir = mkdtempSync(join(tmpdir(), 'seco-ui-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root">seco ui</div>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'window.__seco = true;');
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('configureHttpApp', () => {
  it('mounts API routes under root and /api prefixes', () => {
    const app = express();
    configureHttpApp(app, { dev: false, webUiDist: createStaticUi(), log: () => {} });
    const routerMounts = stack(app).filter((layer) => layer.name === 'router').map((layer) => String(layer.regexp));
    expect(routerMounts.length).toBeGreaterThanOrEqual(2);
    expect(routerMounts.some((regexp) => regexp.includes('api'))).toBe(true);
  });

  it('serves static assets and registers an SPA fallback when UI dist exists', () => {
    const app = express();
    const setup = configureHttpApp(app, { dev: false, webUiDist: createStaticUi(), log: () => {} });
    expect(setup.webUiBuilt).toBe(true);
    expect(stack(app).some((layer) => layer.name === 'serveStatic')).toBe(true);
    expect(stack(app).some((layer) => layer.route?.path === '*')).toBe(true);
  });

  it('does not require a built UI to keep API routes registered', () => {
    const app = express();
    const missingDir = mkdtempSync(join(tmpdir(), 'seco-missing-ui-'));
    tempDirs.push(missingDir);
    const setup = configureHttpApp(app, { dev: false, webUiDist: missingDir, log: () => {} });
    expect(setup.webUiBuilt).toBe(false);
    expect(stack(app).some((layer) => layer.name === 'router')).toBe(true);
    expect(stack(app).some((layer) => layer.name === 'serveStatic')).toBe(false);
  });
});

describe('SPA fallback routing', () => {
  it('keeps API and WebSocket paths out of the static fallback', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/sessions/123')).toBe(true);
    expect(shouldServeSpaFallback('/api/sessions/123')).toBe(false);
    expect(shouldServeSpaFallback('/ws')).toBe(false);
  });

  it('allows browser routes to use the SPA fallback', () => {
    expect(shouldServeSpaFallback('/')).toBe(true);
    expect(shouldServeSpaFallback('/session/abc-123')).toBe(true);
  });
});
