-- Canonical schema. Never modify DB structure outside of a migration file.

CREATE TABLE IF NOT EXISTS experiences (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  organization  TEXT NOT NULL,
  role          TEXT NOT NULL,
  role_type     TEXT NOT NULL CHECK (role_type IN ('internship','full-time','project','leadership','research')),
  start_date    TEXT NOT NULL,
  end_date      TEXT,
  raw_transcript TEXT NOT NULL,
  situation     TEXT NOT NULL,
  task          TEXT NOT NULL,
  action        TEXT NOT NULL,
  result        TEXT NOT NULL,
  skills        TEXT NOT NULL DEFAULT '[]',
  impact_metrics TEXT NOT NULL DEFAULT '[]',
  ats_keywords  TEXT NOT NULL DEFAULT '[]',
  tags          TEXT NOT NULL DEFAULT '[]',
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_versions (
  id            TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL REFERENCES experiences(id),
  version       INTEGER NOT NULL,
  snapshot      TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_snapshots (
  id              TEXT PRIMARY KEY,
  role_title      TEXT NOT NULL,
  company         TEXT NOT NULL,
  jd_raw          TEXT NOT NULL,
  jd_parsed       TEXT NOT NULL,
  experience_ids  TEXT NOT NULL,
  rendered_outputs TEXT NOT NULL,
  gap_analysis    TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intake_sessions (
  id              TEXT PRIMARY KEY,
  transcript      TEXT NOT NULL DEFAULT '',
  messages        TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','saved','abandoned')),
  experience_id   TEXT REFERENCES experiences(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
