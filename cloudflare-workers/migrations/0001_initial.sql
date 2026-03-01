-- Recogning D1 Database Schema
-- Initial migration: recordings metadata

CREATE TABLE IF NOT EXISTS recordings (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  r2_key     TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  mime_type  TEXT NOT NULL DEFAULT 'audio/wav',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  duration_s REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transcriptions (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  language     TEXT NOT NULL DEFAULT 'es',
  text         TEXT NOT NULL,
  word_count   INTEGER NOT NULL DEFAULT 0,
  segments     TEXT, -- JSON array of {start, end, text}
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recordings_created ON recordings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcriptions_recording ON transcriptions(recording_id);
