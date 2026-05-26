import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Use env var override — client reads process.env.SECO_DIR lazily inside getDb()
const testDir = join(tmpdir(), `seco-db-test-${Date.now()}`);
process.env['SECO_DIR'] = testDir;

import { getDb, closeDb } from './client.js';

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('DB client', () => {
  it('creates the expected tables on first run', () => {
    const db = getDb();
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>
    ).map((r) => r.name);

    expect(tables).toContain('experiences');
    expect(tables).toContain('experience_versions');
    expect(tables).toContain('application_snapshots');
    expect(tables).toContain('intake_sessions');
    expect(tables).toContain('_migrations');
  });

  it('is idempotent — calling getDb() twice returns the same instance', () => {
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
  });

  it('records applied migrations', () => {
    const db = getDb();
    const migrations = (
      db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>
    ).map((r) => r.name);
    expect(migrations).toContain('001_initial.sql');
  });
});
