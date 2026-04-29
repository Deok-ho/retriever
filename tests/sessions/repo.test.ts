import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { openHubDb } from "../../src/db/database.js";
import { SessionRepo } from "../../src/sessions/repo.js";
import type { NormalizedEvent } from "../../src/sessions/types.js";

const HARNESS = "claude_code";

function makeMirrorInput(
  overrides: Partial<{
    machine_id: string;
    native_id: string;
    project_id: string | null;
    cwd_at_start: string | null;
    started_at: string;
    last_active_at: string;
    transcript_content: string;
    content_hash: string;
    events: NormalizedEvent[];
    commit_sha: string | null;
  }> = {}
) {
  const base = {
    machine_id: "ms-m4x-001",
    harness: HARNESS as const,
    native_id: "nat-1",
    project_id: null,
    cwd_at_start: "/Users/me/repo",
    started_at: "2026-04-29T00:00:00Z",
    last_active_at: "2026-04-29T00:01:00Z",
    transcript_content: '{"type":"user","timestamp":"2026-04-29T00:00:00Z"}',
    content_hash: "h1",
    events: [
      {
        seq: 0,
        ts: "2026-04-29T00:00:00Z",
        event_type: "user_msg" as const,
        payload: { text: "hello world" },
      },
    ] satisfies NormalizedEvent[],
    commit_sha: null as string | null,
  };
  return { ...base, ...overrides };
}

describe("SessionRepo", () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: SessionRepo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-sess-repo-"));
    db = openHubDb({
      dbPath: path.join(tmpDir, "hub.db"),
      attachmentsDir: path.join(tmpDir, "attachments"),
    });
    repo = new SessionRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("mirror", () => {
    test("inserts a new session, transcript, and events", () => {
      const result = repo.mirror(makeMirrorInput());
      expect(result.session_uid).toBe("ms-m4x-001:claude_code:nat-1");
      expect(result.events_total).toBe(1);
      const row = db
        .prepare("SELECT * FROM sessions WHERE session_uid = ?")
        .get(result.session_uid) as { events_total: number; bytes_total: number };
      expect(row.events_total).toBe(1);
      expect(row.bytes_total).toBeGreaterThan(0);
    });

    test("UPSERT: re-mirroring same session updates transcript and replaces events", () => {
      repo.mirror(makeMirrorInput());
      const updated = repo.mirror(
        makeMirrorInput({
          last_active_at: "2026-04-29T00:05:00Z",
          transcript_content: "longer body",
          content_hash: "h2",
          events: [
            {
              seq: 0,
              ts: "2026-04-29T00:00:00Z",
              event_type: "user_msg" as const,
              payload: { text: "first" },
            },
            {
              seq: 1,
              ts: "2026-04-29T00:05:00Z",
              event_type: "assistant_msg" as const,
              payload: { text: "second" },
            },
          ],
        })
      );
      expect(updated.events_total).toBe(2);
      const trans = db
        .prepare(
          "SELECT content, content_hash FROM session_transcripts WHERE session_uid = ?"
        )
        .get(updated.session_uid) as { content: string; content_hash: string };
      expect(trans.content_hash).toBe("h2");
      expect(trans.content).toBe("longer body");
      const eventCount = (
        db.prepare("SELECT COUNT(*) AS c FROM session_events").get() as {
          c: number;
        }
      ).c;
      expect(eventCount).toBe(2);
    });

    test("appends commit_sha into commit_shas_json (deduped)", () => {
      repo.mirror(makeMirrorInput({ commit_sha: "abc123" }));
      repo.mirror(makeMirrorInput({ commit_sha: "abc123" }));
      repo.mirror(makeMirrorInput({ commit_sha: "def456" }));
      const row = db
        .prepare(
          "SELECT commit_shas_json FROM sessions WHERE machine_id = ? AND harness = ? AND native_id = ?"
        )
        .get("ms-m4x-001", HARNESS, "nat-1") as { commit_shas_json: string };
      expect(JSON.parse(row.commit_shas_json)).toEqual(["abc123", "def456"]);
    });

    test("derives session_files_touched from tool_use events", () => {
      const events: NormalizedEvent[] = [
        {
          seq: 0,
          ts: "2026-04-29T00:00:00Z",
          event_type: "tool_use",
          tool_name: "Read",
          payload: { file_path: "src/foo.ts", args: { file_path: "src/foo.ts" } },
        },
        {
          seq: 1,
          ts: "2026-04-29T00:00:01Z",
          event_type: "tool_use",
          tool_name: "Edit",
          payload: { file_path: "src/foo.ts", args: {} },
        },
        {
          seq: 2,
          ts: "2026-04-29T00:00:02Z",
          event_type: "tool_use",
          tool_name: "Write",
          payload: { file_path: "src/bar.ts", args: {} },
        },
      ];
      repo.mirror(makeMirrorInput({ events }));
      const rows = db
        .prepare(
          "SELECT file_path, primary_op, touch_count FROM session_files_touched ORDER BY file_path"
        )
        .all() as { file_path: string; primary_op: string; touch_count: number }[];
      expect(rows).toHaveLength(2);
      const foo = rows.find((r) => r.file_path === "src/foo.ts")!;
      expect(foo.primary_op).toBe("edit"); // edit beats read
      expect(foo.touch_count).toBe(2);
      const bar = rows.find((r) => r.file_path === "src/bar.ts")!;
      expect(bar.primary_op).toBe("write");
    });
  });

  describe("list", () => {
    beforeEach(() => {
      repo.mirror(makeMirrorInput({ native_id: "n1" }));
      repo.mirror(
        makeMirrorInput({
          native_id: "n2",
          last_active_at: "2026-04-29T00:10:00Z",
        })
      );
      // different harness
      repo.mirror(
        makeMirrorInput({ native_id: "n3" })
      );
    });

    test("returns sessions ordered by last_active_at desc", () => {
      const rows = repo.list({});
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows[0].native_id).toBe("n2");
    });

    test("filters by harness", () => {
      const rows = repo.list({ harness: "claude_code" });
      expect(rows.every((r) => r.harness === "claude_code")).toBe(true);
    });

    test("filters by machine_id", () => {
      const rows = repo.list({ machine_id: "ms-m4x-001" });
      expect(rows.every((r) => r.machine_id === "ms-m4x-001")).toBe(true);
    });

    test("limit caps result count", () => {
      const rows = repo.list({ limit: 1 });
      expect(rows.length).toBe(1);
    });
  });

  describe("read", () => {
    test("returns session, optional transcript, events on demand", () => {
      const r = repo.mirror(
        makeMirrorInput({
          events: [
            {
              seq: 0,
              ts: "2026-04-29T00:00:00Z",
              event_type: "user_msg" as const,
              payload: { text: "msg" },
            },
          ],
        })
      );
      const meta = repo.read(r.session_uid, {});
      expect(meta?.session.events_total).toBe(1);
      expect(meta?.transcript).toBeUndefined();
      expect(meta?.events).toBeUndefined();

      const full = repo.read(r.session_uid, {
        include_transcript: true,
        include_events: true,
      });
      expect(full?.transcript?.content_hash).toBe("h1");
      expect(full?.events).toHaveLength(1);
    });

    test("returns null when session_uid unknown", () => {
      expect(repo.read("does:not:exist", {})).toBeNull();
    });
  });

  describe("search (FTS5)", () => {
    test("matches transcript text and returns snippet", () => {
      repo.mirror(
        makeMirrorInput({
          native_id: "s1",
          transcript_content: "the quick brown fox jumps",
        })
      );
      repo.mirror(
        makeMirrorInput({
          native_id: "s2",
          transcript_content: "lazy dog sleeps",
        })
      );
      const hits = repo.search("brown", {});
      expect(hits).toHaveLength(1);
      expect(hits[0].session_uid.endsWith(":s1")).toBe(true);
      expect(hits[0].snippet.toLowerCase()).toContain("brown");
    });

    test("supports filter combination with FTS query", () => {
      repo.mirror(
        makeMirrorInput({
          native_id: "f1",
          machine_id: "ms-m4x-001",
          transcript_content: "alpha beta",
        })
      );
      repo.mirror(
        makeMirrorInput({
          native_id: "f2",
          machine_id: "other-pc",
          transcript_content: "alpha gamma",
        })
      );
      const hits = repo.search("alpha", { machine_id: "ms-m4x-001" });
      expect(hits).toHaveLength(1);
      expect(hits[0].session_uid).toContain("ms-m4x-001");
    });
  });

  describe("filesTouched", () => {
    test("returns sessions that touched a given path, newest first", () => {
      repo.mirror(
        makeMirrorInput({
          native_id: "ft1",
          last_active_at: "2026-04-29T00:00:00Z",
          events: [
            {
              seq: 0,
              ts: "2026-04-29T00:00:00Z",
              event_type: "tool_use" as const,
              tool_name: "Edit",
              payload: { file_path: "src/x.ts", args: {} },
            },
          ],
        })
      );
      repo.mirror(
        makeMirrorInput({
          native_id: "ft2",
          last_active_at: "2026-04-29T01:00:00Z",
          events: [
            {
              seq: 0,
              ts: "2026-04-29T01:00:00Z",
              event_type: "tool_use" as const,
              tool_name: "Read",
              payload: { file_path: "src/x.ts", args: {} },
            },
          ],
        })
      );
      const rows = repo.filesTouched("src/x.ts", {});
      expect(rows).toHaveLength(2);
      expect(rows[0].native_id).toBe("ft2");
    });
  });
});
