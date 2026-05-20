// Embedded migration SQL. Compiled into the bundle so the dist package is self-contained.

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial",
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'done', 'archived')),
        health TEXT NOT NULL CHECK (health IN ('green', 'yellow', 'red')),
        priority TEXT NOT NULL CHECK (priority IN ('high', 'med', 'low')),
        phase TEXT,
        repo_path TEXT,
        harness_project TEXT,
        purpose TEXT,
        goal TEXT,
        context_budget INTEGER DEFAULT 50000,
        next_task_id TEXT,
        stalled_since TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority);

      CREATE TABLE IF NOT EXISTS tickets (
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'review', 'done', 'blocked')),
        priority TEXT NOT NULL CHECK (priority IN ('high', 'med', 'low')),
        task_type TEXT CHECK (task_type IN ('구현', '리서치', '문서', '리뷰')),
        summary TEXT NOT NULL,
        body TEXT DEFAULT '',
        estimated_hours REAL,
        actual_hours REAL,
        intake_source TEXT DEFAULT 'manual' CHECK (intake_source IN ('manual', 'gemma4', 'mcp', 'import')),
        ai_classified_at TEXT,
        stalled_since TEXT,
        completed_at TEXT,
        learnings TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, task_id),
        FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
      CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at DESC);

      CREATE TABLE IF NOT EXISTS completion_criteria (
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        text TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
        PRIMARY KEY (project_id, task_id, idx),
        FOREIGN KEY (project_id, task_id) REFERENCES tickets(project_id, task_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS attachments (
        attachment_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('session', 'diff', 'research', 'external', 'transcript')),
        path TEXT,
        url TEXT,
        size_bytes INTEGER,
        content_hash TEXT,
        summary_hash TEXT,
        added_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id, task_id) REFERENCES tickets(project_id, task_id) ON DELETE CASCADE,
        CHECK ((type = 'external' AND url IS NOT NULL) OR (type != 'external' AND path IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments(project_id, task_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_type ON attachments(type);

      CREATE TABLE IF NOT EXISTS dependencies (
        from_project_id TEXT NOT NULL,
        from_task_id TEXT NOT NULL,
        to_project_id TEXT NOT NULL,
        to_task_id TEXT NOT NULL,
        PRIMARY KEY (from_project_id, from_task_id, to_project_id, to_task_id),
        FOREIGN KEY (from_project_id, from_task_id) REFERENCES tickets(project_id, task_id) ON DELETE CASCADE,
        FOREIGN KEY (to_project_id, to_task_id) REFERENCES tickets(project_id, task_id) ON DELETE CASCADE,
        CHECK (NOT (from_project_id = to_project_id AND from_task_id = to_task_id))
      );

      CREATE TABLE IF NOT EXISTS context_refs (
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        ref TEXT NOT NULL,
        PRIMARY KEY (project_id, task_id, ref),
        FOREIGN KEY (project_id, task_id) REFERENCES tickets(project_id, task_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS device_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_name TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('session_push', 'tool_call', 'git_activity', 'attachment_add', 'ticket_transition')),
        project_id TEXT,
        task_id TEXT,
        payload TEXT,
        occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_events_device ON device_events(device_name, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_ticket ON device_events(project_id, task_id);
    `,
  },
  {
    version: 2,
    name: "sessions_v1",
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        session_uid       TEXT PRIMARY KEY,
        machine_id        TEXT NOT NULL,
        harness           TEXT NOT NULL CHECK (harness IN ('claude_code','codex','gemini','qwen','other')),
        native_id         TEXT NOT NULL,
        project_id        TEXT REFERENCES projects(project_id) ON DELETE SET NULL,
        cwd_at_start      TEXT,
        started_at        TEXT NOT NULL,
        last_active_at    TEXT NOT NULL,
        ended_at          TEXT,
        status            TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','idle','archived','cleared')),
        commit_shas_json  TEXT NOT NULL DEFAULT '[]',
        bytes_total       INTEGER NOT NULL DEFAULT 0,
        events_total      INTEGER NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (machine_id, harness, native_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_project    ON sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_machine    ON sessions(machine_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_active_at  ON sessions(last_active_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_harness    ON sessions(harness);

      CREATE TABLE IF NOT EXISTS session_transcripts (
        session_uid   TEXT PRIMARY KEY REFERENCES sessions(session_uid) ON DELETE CASCADE,
        content       TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        format        TEXT NOT NULL DEFAULT 'jsonl-v1',
        stored_at     TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS session_transcripts_fts USING fts5(
        session_uid UNINDEXED,
        content,
        tokenize = 'unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER IF NOT EXISTS session_transcripts_ai
        AFTER INSERT ON session_transcripts BEGIN
          INSERT INTO session_transcripts_fts (session_uid, content)
            VALUES (new.session_uid, new.content);
        END;
      CREATE TRIGGER IF NOT EXISTS session_transcripts_ad
        AFTER DELETE ON session_transcripts BEGIN
          DELETE FROM session_transcripts_fts WHERE session_uid = old.session_uid;
        END;
      CREATE TRIGGER IF NOT EXISTS session_transcripts_au
        AFTER UPDATE ON session_transcripts BEGIN
          DELETE FROM session_transcripts_fts WHERE session_uid = old.session_uid;
          INSERT INTO session_transcripts_fts (session_uid, content)
            VALUES (new.session_uid, new.content);
        END;

      CREATE TABLE IF NOT EXISTS session_events (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        session_uid   TEXT NOT NULL REFERENCES sessions(session_uid) ON DELETE CASCADE,
        seq           INTEGER NOT NULL,
        ts            TEXT NOT NULL,
        event_type    TEXT NOT NULL CHECK (event_type IN
                        ('user_msg','assistant_msg','tool_use','tool_result',
                         'thinking','system','meta')),
        tool_name     TEXT,
        payload_json  TEXT NOT NULL,
        is_error      INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_events_session   ON session_events(session_uid, seq);
      CREATE INDEX IF NOT EXISTS idx_events_tool_name ON session_events(tool_name) WHERE tool_name IS NOT NULL;

      CREATE TABLE IF NOT EXISTS session_files_touched (
        session_uid    TEXT NOT NULL REFERENCES sessions(session_uid) ON DELETE CASCADE,
        file_path      TEXT NOT NULL,
        first_touch_at TEXT NOT NULL,
        last_touch_at  TEXT NOT NULL,
        touch_count    INTEGER NOT NULL DEFAULT 1,
        primary_op     TEXT NOT NULL CHECK (primary_op IN ('read','edit','write','delete','rename')),
        PRIMARY KEY (session_uid, file_path)
      );
      CREATE INDEX IF NOT EXISTS idx_files_touched ON session_files_touched(file_path);
    `,
  },
  {
    version: 3,
    name: "store_v1",
    sql: `
      CREATE TABLE IF NOT EXISTS devices (
        device_id  TEXT PRIMARY KEY,
        hostname   TEXT,
        os         TEXT,
        role       TEXT NOT NULL CHECK (role IN ('coordinator', 'node')) DEFAULT 'node',
        last_seen  TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS desired_states (
        project_id   TEXT NOT NULL,
        kind         TEXT NOT NULL CHECK (kind IN ('memory', 'rules', 'config')),
        key          TEXT NOT NULL,
        content      TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        frontmatter  TEXT,
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by   TEXT,
        PRIMARY KEY (project_id, kind, key),
        FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_desired_kind    ON desired_states(kind);
      CREATE INDEX IF NOT EXISTS idx_desired_updated ON desired_states(updated_at DESC);

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
        actor      TEXT,
        payload    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_state_events_ts      ON state_events(ts DESC);
      CREATE INDEX IF NOT EXISTS idx_state_events_project ON state_events(project_id);
      CREATE INDEX IF NOT EXISTS idx_state_events_type    ON state_events(event_type);
    `,
  },
];
