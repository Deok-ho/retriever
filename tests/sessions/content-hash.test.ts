import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import Database from "better-sqlite3";
import { openHubDb } from "../../src/db/database.js";
import { SessionRepo } from "../../src/sessions/repo.js";

const sha = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

describe("SessionRepo.mirror — server-side content_hash recompute (Codex 주의급 #6)", () => {
  let tmp: string;
  let db: Database.Database;
  let repo: SessionRepo;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-hash-"));
    db = openHubDb({
      dbPath: path.join(tmp, "hub.db"),
      attachmentsDir: path.join(tmp, "attachments"),
    });
    repo = new SessionRepo(db);
  });
  afterEach(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

  test("client-supplied hash matches → DB stores server-computed value (which equals it)", () => {
    const content = "the quick brown fox";
    const expected = sha(content);
    repo.mirror({
      machine_id: "m",
      harness: "claude_code",
      native_id: "n1",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:00:00Z",
      transcript_content: content,
      content_hash: expected,
      events: [],
    });
    const row = db
      .prepare("SELECT content_hash FROM session_transcripts WHERE session_uid = ?")
      .get("m:claude_code:n1") as { content_hash: string };
    expect(row.content_hash).toBe(expected);
  });

  test("client lies about hash → DB stores server-computed truth (defensive)", () => {
    const content = "honest body";
    const honest = sha(content);
    // Client provides wrong hash (could happen via bugs or tampering)
    repo.mirror({
      machine_id: "m",
      harness: "claude_code",
      native_id: "n2",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:00:00Z",
      transcript_content: content,
      content_hash: "0".repeat(64), // intentionally wrong
      events: [],
    });
    const row = db
      .prepare("SELECT content_hash FROM session_transcripts WHERE session_uid = ?")
      .get("m:claude_code:n2") as { content_hash: string };
    expect(row.content_hash).toBe(honest);
    expect(row.content_hash).not.toBe("0".repeat(64));
  });

  test("hash recompute survives content edit on UPSERT", () => {
    repo.mirror({
      machine_id: "m",
      harness: "claude_code",
      native_id: "n3",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:00:00Z",
      transcript_content: "v1",
      content_hash: sha("v1"),
      events: [],
    });
    repo.mirror({
      machine_id: "m",
      harness: "claude_code",
      native_id: "n3",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:00:01Z",
      transcript_content: "v2-much-longer-body",
      content_hash: sha("v1"), // stale — caller forgot to recompute
      events: [],
    });
    const row = db
      .prepare("SELECT content, content_hash FROM session_transcripts WHERE session_uid = ?")
      .get("m:claude_code:n3") as { content: string; content_hash: string };
    expect(row.content).toBe("v2-much-longer-body");
    expect(row.content_hash).toBe(sha("v2-much-longer-body"));
  });

  test("empty content yields the SHA256 of empty string (well-defined)", () => {
    repo.mirror({
      machine_id: "m",
      harness: "claude_code",
      native_id: "n4",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:00:00Z",
      transcript_content: "",
      content_hash: "anything",
      events: [],
    });
    const row = db
      .prepare("SELECT content_hash FROM session_transcripts WHERE session_uid = ?")
      .get("m:claude_code:n4") as { content_hash: string };
    expect(row.content_hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});
