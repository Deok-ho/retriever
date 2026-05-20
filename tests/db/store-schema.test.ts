import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { openHubDb } from "../../src/db/database.js";

describe("DB migration v3 — store schema (devices / desired / actual / state_events)", () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-store-schema-"));
    db = openHubDb({
      dbPath: path.join(tmpDir, "hub.db"),
      attachmentsDir: path.join(tmpDir, "attachments"),
    });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("schema_migrations records v3", () => {
    const versions = (
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(3);
  });

  test("creates all four store tables", () => {
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table'
           AND name IN ('devices','desired_states','actual_states','state_events')
         ORDER BY name`
      )
      .all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual([
      "actual_states",
      "desired_states",
      "devices",
      "state_events",
    ]);
  });

  test("devices.role rejects invalid value", () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO devices (device_id, role) VALUES ('d1', 'invalid')"
        )
        .run()
    ).toThrow(/CHECK/);
  });

  test("devices accepts coordinator and node roles, defaults to node", () => {
    db.prepare(
      "INSERT INTO devices (device_id, hostname, os, role) VALUES ('mstd_001','mstd.local','darwin','coordinator')"
    ).run();
    db.prepare(
      "INSERT INTO devices (device_id, hostname, os) VALUES ('theco_asus','asus.local','win32')"
    ).run();
    const rows = db
      .prepare("SELECT device_id, role FROM devices ORDER BY device_id")
      .all() as { device_id: string; role: string }[];
    expect(rows).toEqual([
      { device_id: "mstd_001", role: "coordinator" },
      { device_id: "theco_asus", role: "node" },
    ]);
  });

  test("desired_states.kind CHECK allows memory/rules/config and rejects others", () => {
    db.prepare(
      `INSERT INTO projects (project_id, status, health, priority)
       VALUES ('p1','active','green','med')`
    ).run();
    for (const kind of ["memory", "rules", "config"]) {
      db.prepare(
        `INSERT INTO desired_states (project_id, kind, key, content, content_hash)
         VALUES ('p1', ?, ?, 'c', 'h')`
      ).run(kind, `k-${kind}`);
    }
    expect(() =>
      db
        .prepare(
          `INSERT INTO desired_states (project_id, kind, key, content, content_hash)
           VALUES ('p1','docs','k-bad','c','h')`
        )
        .run()
    ).toThrow(/CHECK/);
  });

  test("desired_states UPSERT via composite PK", () => {
    db.prepare(
      `INSERT INTO projects (project_id, status, health, priority)
       VALUES ('p2','active','green','med')`
    ).run();
    db.prepare(
      `INSERT INTO desired_states (project_id, kind, key, content, content_hash)
       VALUES ('p2','memory','CLAUDE.md','v1','h1')`
    ).run();
    expect(() =>
      db
        .prepare(
          `INSERT INTO desired_states (project_id, kind, key, content, content_hash)
           VALUES ('p2','memory','CLAUDE.md','v2','h2')`
        )
        .run()
    ).toThrow(/UNIQUE|PRIMARY KEY/);

    db.prepare(
      `UPDATE desired_states SET content=?, content_hash=?
       WHERE project_id='p2' AND kind='memory' AND key='CLAUDE.md'`
    ).run("v2", "h2");
    const row = db
      .prepare(
        `SELECT content, content_hash FROM desired_states
         WHERE project_id='p2' AND kind='memory' AND key='CLAUDE.md'`
      )
      .get() as { content: string; content_hash: string };
    expect(row).toEqual({ content: "v2", content_hash: "h2" });
  });

  test("actual_states composite PK includes device_id", () => {
    db.prepare(
      `INSERT INTO projects (project_id, status, health, priority)
       VALUES ('p3','active','green','med')`
    ).run();
    db.prepare("INSERT INTO devices (device_id, role) VALUES ('d-a','node')").run();
    db.prepare("INSERT INTO devices (device_id, role) VALUES ('d-b','node')").run();

    const ins = db.prepare(
      `INSERT INTO actual_states (device_id, project_id, kind, key, content, content_hash)
       VALUES (?, 'p3', 'memory', 'CLAUDE.md', ?, ?)`
    );
    ins.run("d-a", "ca", "ha");
    ins.run("d-b", "cb", "hb"); // same (project, kind, key) on different device — OK

    expect(() => ins.run("d-a", "ca2", "ha2")).toThrow(/UNIQUE|PRIMARY KEY/);
  });

  test("state_events.event_type CHECK enforces allowed set", () => {
    const allowed = [
      "desired_changed",
      "actual_collected",
      "diff_detected",
      "apply_succeeded",
      "apply_failed",
      "import_done",
      "gemma4_validated",
    ];
    for (const t of allowed) {
      db.prepare(
        "INSERT INTO state_events (event_type, actor) VALUES (?, 'user')"
      ).run(t);
    }
    expect(() =>
      db
        .prepare(
          "INSERT INTO state_events (event_type, actor) VALUES ('unknown','user')"
        )
        .run()
    ).toThrow(/CHECK/);
    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM state_events").get() as { c: number }
    ).c;
    expect(count).toBe(allowed.length);
  });

  test("desired_states.project_id FK cascades on project delete", () => {
    db.prepare(
      `INSERT INTO projects (project_id, status, health, priority)
       VALUES ('p-del','active','green','med')`
    ).run();
    db.prepare(
      `INSERT INTO desired_states (project_id, kind, key, content, content_hash)
       VALUES ('p-del','memory','x','c','h')`
    ).run();
    db.prepare("DELETE FROM projects WHERE project_id='p-del'").run();
    const cnt = (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM desired_states WHERE project_id='p-del'"
        )
        .get() as { c: number }
    ).c;
    expect(cnt).toBe(0);
  });

  test("actual_states FK to devices cascades on device delete", () => {
    db.prepare(
      `INSERT INTO projects (project_id, status, health, priority)
       VALUES ('p-fk','active','green','med')`
    ).run();
    db.prepare("INSERT INTO devices (device_id, role) VALUES ('d-fk','node')").run();
    db.prepare(
      `INSERT INTO actual_states (device_id, project_id, kind, key, content, content_hash)
       VALUES ('d-fk','p-fk','memory','x','c','h')`
    ).run();
    db.prepare("DELETE FROM devices WHERE device_id='d-fk'").run();
    const cnt = (
      db
        .prepare("SELECT COUNT(*) AS c FROM actual_states WHERE device_id='d-fk'")
        .get() as { c: number }
    ).c;
    expect(cnt).toBe(0);
  });

  test("expected indexes are created", () => {
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='index'
           AND name IN (
             'idx_desired_kind','idx_desired_updated',
             'idx_actual_device','idx_actual_collected',
             'idx_state_events_ts','idx_state_events_project','idx_state_events_type'
           )
         ORDER BY name`
      )
      .all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual([
      "idx_actual_collected",
      "idx_actual_device",
      "idx_desired_kind",
      "idx_desired_updated",
      "idx_state_events_project",
      "idx_state_events_ts",
      "idx_state_events_type",
    ]);
  });
});
