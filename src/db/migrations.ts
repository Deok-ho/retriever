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
];
