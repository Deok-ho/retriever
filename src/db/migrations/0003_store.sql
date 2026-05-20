-- Retriever Hub DB — Store v1 (Spec [[2026-05-20_SQLite_Store_Spec]] §1.1)
-- Adds desired-state / actual-state / devices / state_events for coordinator-node sync.
-- Target: SQLite 3.40+, applied incrementally on top of v1+v2.

-- === Devices ===
CREATE TABLE IF NOT EXISTS devices (
  device_id  TEXT PRIMARY KEY,                       -- 'theco_asus', 'mstd_001', ...
  hostname   TEXT,
  os         TEXT,                                   -- 'darwin' | 'win32' | 'linux'
  role       TEXT NOT NULL CHECK (role IN ('coordinator', 'node')) DEFAULT 'node',
  last_seen  TEXT,                                   -- ISO datetime
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- === Desired States ===
CREATE TABLE IF NOT EXISTS desired_states (
  project_id   TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('memory', 'rules', 'config')),
  key          TEXT NOT NULL,                        -- 파일 식별자
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,                        -- SHA-256
  frontmatter  TEXT,                                 -- YAML→JSON 직렬화
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by   TEXT,                                 -- user|gemma4|claude|codex|sync|import
  PRIMARY KEY (project_id, kind, key),
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_desired_kind    ON desired_states(kind);
CREATE INDEX IF NOT EXISTS idx_desired_updated ON desired_states(updated_at DESC);

-- === Actual States ===
CREATE TABLE IF NOT EXISTS actual_states (
  device_id    TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  key          TEXT NOT NULL,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (device_id, project_id, kind, key),
  FOREIGN KEY (device_id)  REFERENCES devices(device_id)   ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_actual_device    ON actual_states(device_id);
CREATE INDEX IF NOT EXISTS idx_actual_collected ON actual_states(collected_at DESC);

-- === State Events (시간순 변경 로그) ===
CREATE TABLE IF NOT EXISTS state_events (
  event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL DEFAULT (datetime('now')),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'desired_changed', 'actual_collected', 'diff_detected',
    'apply_succeeded', 'apply_failed', 'import_done', 'gemma4_validated'
  )),
  project_id TEXT,
  kind       TEXT,
  key        TEXT,
  device_id  TEXT,
  actor      TEXT,                                   -- user|gemma4|claude|codex|sync
  payload    TEXT                                    -- JSON
);

CREATE INDEX IF NOT EXISTS idx_state_events_ts      ON state_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_state_events_project ON state_events(project_id);
CREATE INDEX IF NOT EXISTS idx_state_events_type    ON state_events(event_type);
