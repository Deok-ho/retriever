import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { openHubDb } from "../../src/db/database.js";

describe("DB migration v2 — session manager schema", () => {
  let tmpDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-sessions-schema-"));
    dbPath = path.join(tmpDir, "hub.db");
    db = openHubDb({
      dbPath,
      attachmentsDir: path.join(tmpDir, "attachments"),
    });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates sessions table with required columns", () => {
    const cols = db
      .prepare("PRAGMA table_info(sessions)")
      .all() as { name: string; notnull: number }[];
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        "session_uid",
        "machine_id",
        "harness",
        "native_id",
        "project_id",
        "cwd_at_start",
        "started_at",
        "last_active_at",
        "ended_at",
        "status",
        "commit_shas_json",
        "bytes_total",
        "events_total",
        "created_at",
        "updated_at",
      ].sort()
    );
  });

  test("session_transcripts table exists with content + content_hash", () => {
    const cols = db
      .prepare("PRAGMA table_info(session_transcripts)")
      .all() as { name: string }[];
    const names = cols.map((c) => c.name).sort();
    expect(names).toContain("session_uid");
    expect(names).toContain("content");
    expect(names).toContain("content_hash");
    expect(names).toContain("format");
    expect(names).toContain("stored_at");
  });

  test("session_transcripts_fts virtual table responds to MATCH", () => {
    db.prepare(
      `INSERT INTO sessions
        (session_uid, machine_id, harness, native_id, started_at, last_active_at, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run("m:claude_code:n1", "m", "claude_code", "n1", "2026-04-29T00:00:00Z", "2026-04-29T00:00:00Z", "2026-04-29T00:00:00Z", "2026-04-29T00:00:00Z");
    db.prepare(
      `INSERT INTO session_transcripts (session_uid, content, content_hash, format, stored_at)
        VALUES (?, ?, ?, 'jsonl-v1', ?)`
    ).run("m:claude_code:n1", "hello quick brown fox", "h1", "2026-04-29T00:00:00Z");

    const rows = db
      .prepare(
        "SELECT session_uid FROM session_transcripts_fts WHERE content MATCH ? ORDER BY rank"
      )
      .all("brown") as { session_uid: string }[];
    expect(rows.map((r) => r.session_uid)).toContain("m:claude_code:n1");
  });

  test("session_events accepts canonical event_type values", () => {
    db.prepare(
      `INSERT INTO sessions
        (session_uid, machine_id, harness, native_id, started_at, last_active_at, status, created_at, updated_at)
        VALUES ('m:claude_code:n2','m','claude_code','n2','t','t','active','t','t')`
    ).run();
    const types = ["user_msg", "assistant_msg", "tool_use", "tool_result", "thinking", "system", "meta"];
    for (let i = 0; i < types.length; i++) {
      db.prepare(
        `INSERT INTO session_events (session_uid, seq, ts, event_type, payload_json)
          VALUES (?, ?, ?, ?, '{}')`
      ).run("m:claude_code:n2", i, "t", types[i]);
    }
    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM session_events").get() as { c: number }
    ).c;
    expect(count).toBe(types.length);
  });

  test("session_events rejects unknown event_type", () => {
    db.prepare(
      `INSERT INTO sessions
        (session_uid, machine_id, harness, native_id, started_at, last_active_at, status, created_at, updated_at)
        VALUES ('m:claude_code:n3','m','claude_code','n3','t','t','active','t','t')`
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO session_events (session_uid, seq, ts, event_type, payload_json)
          VALUES ('m:claude_code:n3', 0, 't', 'invalid_type', '{}')`
      ).run()
    ).toThrow(/CHECK/);
  });

  test("session_files_touched aggregates with composite PK", () => {
    db.prepare(
      `INSERT INTO sessions
        (session_uid, machine_id, harness, native_id, started_at, last_active_at, status, created_at, updated_at)
        VALUES ('m:claude_code:n4','m','claude_code','n4','t','t','active','t','t')`
    ).run();
    db.prepare(
      `INSERT INTO session_files_touched
        (session_uid, file_path, first_touch_at, last_touch_at, touch_count, primary_op)
        VALUES ('m:claude_code:n4', 'src/foo.ts', 't', 't', 3, 'edit')`
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO session_files_touched
          (session_uid, file_path, first_touch_at, last_touch_at, touch_count, primary_op)
          VALUES ('m:claude_code:n4', 'src/foo.ts', 't', 't', 1, 'read')`
      ).run()
    ).toThrow(/UNIQUE|PRIMARY KEY/);
  });

  test("ON DELETE CASCADE removes child rows when session deleted", () => {
    db.prepare(
      `INSERT INTO sessions
        (session_uid, machine_id, harness, native_id, started_at, last_active_at, status, created_at, updated_at)
        VALUES ('m:claude_code:n5','m','claude_code','n5','t','t','active','t','t')`
    ).run();
    db.prepare(
      `INSERT INTO session_transcripts (session_uid, content, content_hash, format, stored_at)
        VALUES ('m:claude_code:n5','x','h','jsonl-v1','t')`
    ).run();
    db.prepare(
      `INSERT INTO session_events (session_uid, seq, ts, event_type, payload_json)
        VALUES ('m:claude_code:n5', 0, 't', 'meta', '{}')`
    ).run();
    db.prepare("DELETE FROM sessions WHERE session_uid = ?").run(
      "m:claude_code:n5"
    );
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM session_transcripts").get() as {
        c: number;
      }).c
    ).toBe(0);
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM session_events").get() as {
        c: number;
      }).c
    ).toBe(0);
  });
});
