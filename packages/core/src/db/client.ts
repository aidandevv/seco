import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSecoDir } from '../config/keys.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getSecoDbPath(): string {
  return join(getSecoDir(), 'seco.db');
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const secoDir = getSecoDir();
  mkdirSync(secoDir, { recursive: true });
  _db = new Database(join(secoDir, 'seco.db'));
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  runMigrations(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const migrationsDir = join(__dirname, 'migrations');
  if (!existsSync(migrationsDir)) return;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const already = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(file);
    if (!already) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString()
      );
    }
  }
}
