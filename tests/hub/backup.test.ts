import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { openHubDb } from "../../src/db/database.js";
import { backupHubDb, restoreHubDb } from "../../src/hub/backup.js";
import { SessionRepo } from "../../src/sessions/repo.js";

describe("hub backup / restore (Codex 주의급 #9)", () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-bak-"));
    dbPath = path.join(tmp, "hub.db");
    const db = openHubDb({
      dbPath,
      attachmentsDir: path.join(tmp, "attachments"),
    });
    const repo = new SessionRepo(db);
    repo.mirror({
      machine_id: "m",
      harness: "claude_code",
      native_id: "seed",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:00:00Z",
      transcript_content: "backup-target",
      content_hash: "x",
      events: [
        { seq: 0, ts: "2026-04-30T00:00:00Z", event_type: "user_msg", payload: { text: "hi" } },
      ],
    });
    db.close();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("backup creates a valid SQLite file with the expected rows", () => {
    const target = path.join(tmp, "out.db");
    const r = backupHubDb({ source: dbPath, target });
    expect(r.bytes).toBeGreaterThan(0);
    expect(fs.existsSync(target)).toBe(true);

    // Open the backup read-only and confirm session row survived
    const ro = new Database(target, { readonly: true });
    try {
      const row = ro.prepare("SELECT native_id FROM sessions").get() as { native_id: string };
      expect(row.native_id).toBe("seed");
    } finally {
      ro.close();
    }
  });

  test("backup refuses to overwrite by default", () => {
    const target = path.join(tmp, "exists.db");
    fs.writeFileSync(target, "placeholder");
    expect(() => backupHubDb({ source: dbPath, target })).toThrow(/target exists/);
  });

  test("backup overwrites with overwrite:true", () => {
    const target = path.join(tmp, "force.db");
    fs.writeFileSync(target, "placeholder");
    const r = backupHubDb({ source: dbPath, target, overwrite: true });
    expect(r.bytes).toBeGreaterThan(20);
  });

  test("restore replaces target and preserves the previous DB as .bak", () => {
    const target = path.join(tmp, "out.db");
    backupHubDb({ source: dbPath, target });

    // Create a different "live" DB at restoreTarget
    const restoreTarget = path.join(tmp, "live.db");
    const liveDb = openHubDb({ dbPath: restoreTarget, attachmentsDir: tmp });
    new SessionRepo(liveDb).mirror({
      machine_id: "m",
      harness: "codex",
      native_id: "live-only",
      started_at: "2026-04-30T01:00:00Z",
      last_active_at: "2026-04-30T01:00:00Z",
      transcript_content: "live",
      content_hash: "y",
      events: [],
    });
    liveDb.close();

    const r = restoreHubDb({ source: target, target: restoreTarget });
    expect(r.preservedAs).toBeTruthy();
    expect(fs.existsSync(r.preservedAs!)).toBe(true);

    // After restore, restoreTarget should hold the backup contents (seed only)
    const after = new Database(restoreTarget, { readonly: true });
    try {
      const native = after.prepare("SELECT native_id FROM sessions").all() as { native_id: string }[];
      expect(native.map(x => x.native_id)).toEqual(["seed"]);
    } finally {
      after.close();
    }
  });

  test("restore rejects non-SQLite files (header check)", () => {
    const bad = path.join(tmp, "bad.db");
    fs.writeFileSync(bad, "this is not a sqlite file");
    expect(() => restoreHubDb({ source: bad, target: path.join(tmp, "x.db") })).toThrow(
      /not a SQLite database/
    );
  });

  test("restore creates target dir when missing", () => {
    const target = path.join(tmp, "out.db");
    backupHubDb({ source: dbPath, target });
    const nestedTarget = path.join(tmp, "nested/dir/restored.db");
    const r = restoreHubDb({ source: target, target: nestedTarget });
    expect(fs.existsSync(nestedTarget)).toBe(true);
    expect(r.preservedAs).toBeNull();
  });
});
