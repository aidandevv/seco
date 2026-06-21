ALTER TABLE intake_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'text' CHECK (mode IN ('voice','text'));
ALTER TABLE intake_sessions ADD COLUMN auto_listen_enabled INTEGER NOT NULL DEFAULT 0;
