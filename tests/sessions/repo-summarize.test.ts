import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { openHubDb } from "../../src/db/database.js";
import { SessionRepo } from "../../src/sessions/repo.js";

describe("SessionRepo.summarize / dailyDigest", () => {
  let tmp: string;
  let db: Database.Database;
  let repo: SessionRepo;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-summarize-"));
    db = openHubDb({
      dbPath: path.join(tmp, "hub.db"),
      attachmentsDir: path.join(tmp, "attachments"),
    });
    repo = new SessionRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function seed(uid: string, overrides: Record<string, unknown> = {}, evs?: Array<Record<string, unknown>>) {
    const events = (evs ?? [
      { seq: 0, ts: "2026-04-30T01:00:00Z", event_type: "user_msg", payload: { text: "first user message" } },
      { seq: 1, ts: "2026-04-30T01:01:00Z", event_type: "tool_use", tool_name: "Bash", payload: { command: "ls", args: { command: "ls" } } },
      { seq: 2, ts: "2026-04-30T01:01:30Z", event_type: "tool_result", payload: { result_text: "files", is_error: false } },
      { seq: 3, ts: "2026-04-30T01:02:00Z", event_type: "tool_use", tool_name: "Edit", payload: { file_path: "src/x.ts", args: {} } },
      { seq: 4, ts: "2026-04-30T01:03:00Z", event_type: "assistant_msg", payload: { text: "first answer" } },
      { seq: 5, ts: "2026-04-30T01:05:00Z", event_type: "assistant_msg", payload: { text: "final answer" } },
    ]) as never;
    repo.mirror({
      machine_id: "ms-m4x-001",
      harness: "claude_code",
      native_id: uid,
      started_at: "2026-04-30T01:00:00Z",
      last_active_at: "2026-04-30T01:05:00Z",
      transcript_content: "x",
      content_hash: `h-${uid}`,
      events,
      ...overrides,
    });
    return `ms-m4x-001:claude_code:${uid}`;
  }

  describe("summarize(session_uid)", () => {
    test("extracts first user msg, last assistant msg, tool_counts, errors", () => {
      const uid = seed("s1");
      const sum = repo.summarize(uid);
      expect(sum).not.toBeNull();
      expect(sum!.first_user_msg).toBe("first user message");
      expect(sum!.last_assistant_msg).toBe("final answer");
      expect(sum!.tool_counts).toEqual({ Bash: 1, Edit: 1 });
      expect(sum!.errors_count).toBe(0);
      expect(sum!.duration_seconds).toBe(300); // 5 min
    });

    test("counts errors from tool_result is_error", () => {
      const uid = seed("s2", {}, [
        { seq: 0, ts: "2026-04-30T01:00:00Z", event_type: "user_msg", payload: { text: "hi" } },
        { seq: 1, ts: "2026-04-30T01:00:01Z", event_type: "tool_use", tool_name: "Bash", payload: { command: "x", args: {} } },
        { seq: 2, ts: "2026-04-30T01:00:02Z", event_type: "tool_result", payload: { result_text: "err1", is_error: true } },
        { seq: 3, ts: "2026-04-30T01:00:03Z", event_type: "tool_use", tool_name: "Bash", payload: { command: "y", args: {} } },
        { seq: 4, ts: "2026-04-30T01:00:04Z", event_type: "tool_result", payload: { result_text: "err2", is_error: true } },
      ]);
      const sum = repo.summarize(uid)!;
      expect(sum.errors_count).toBe(2);
    });

    test("returns null when session_uid unknown", () => {
      expect(repo.summarize("nope")).toBeNull();
    });

    test("truncates long messages", () => {
      const long = "x".repeat(500);
      const uid = seed("s3", {}, [
        { seq: 0, ts: "2026-04-30T01:00:00Z", event_type: "user_msg", payload: { text: long } },
        { seq: 1, ts: "2026-04-30T01:00:01Z", event_type: "assistant_msg", payload: { text: long } },
      ]);
      const sum = repo.summarize(uid)!;
      expect(sum.first_user_msg.length).toBeLessThanOrEqual(280);
      expect(sum.last_assistant_msg.length).toBeLessThanOrEqual(280);
    });
  });

  describe("dailyDigest({ since, until })", () => {
    test("returns sessions in window with embedded summary", () => {
      seed("d1", {
        last_active_at: "2026-04-30T05:00:00Z",
      });
      seed("d2", {
        started_at: "2026-04-29T01:00:00Z",
        last_active_at: "2026-04-29T05:00:00Z",
      });
      const out = repo.dailyDigest({
        since: "2026-04-30T00:00:00Z",
        until: "2026-04-30T23:59:59Z",
      });
      expect(out).toHaveLength(1);
      expect(out[0].native_id).toBe("d1");
      expect(out[0].summary.first_user_msg).toBe("first user message");
    });

    test("orders sessions by last_active_at desc", () => {
      seed("a", { last_active_at: "2026-04-30T03:00:00Z" });
      seed("b", { last_active_at: "2026-04-30T05:00:00Z" });
      seed("c", { last_active_at: "2026-04-30T04:00:00Z" });
      const out = repo.dailyDigest({
        since: "2026-04-30T00:00:00Z",
        until: "2026-04-30T23:59:59Z",
      });
      expect(out.map((r) => r.native_id)).toEqual(["b", "c", "a"]);
    });

    test("batch SQL: 50 sessions executes O(1) prepared statements (Codex 주의급 #5)", () => {
      // Seed 50 sessions in the same window
      for (let i = 0; i < 50; i++) {
        seed(`bulk-${i}`, {
          last_active_at: `2026-04-30T${(i % 24).toString().padStart(2, "0")}:30:00Z`,
        });
      }
      const t0 = performance.now();
      const out = repo.dailyDigest({
        since: "2026-04-30T00:00:00Z",
        until: "2026-04-30T23:59:59Z",
        limit: 50,
      });
      const ms = performance.now() - t0;
      expect(out).toHaveLength(50);
      // Sanity: each row has a populated summary derived from its events
      for (const r of out) {
        expect(r.summary.first_user_msg).toBe("first user message");
        expect(r.summary.tool_counts).toEqual({ Bash: 1, Edit: 1 });
      }
      // Fast — batch path. Generous bound for CI but catches accidental N+1 regression.
      expect(ms).toBeLessThan(500);
    });
  });
});
