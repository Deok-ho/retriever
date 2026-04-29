import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { openHubDb } from "../../src/db/database.js";
import { SessionRepo } from "../../src/sessions/repo.js";

describe("FTS5 query sanitization (Codex post-accept #4)", () => {
  let tmp: string;
  let db: Database.Database;
  let repo: SessionRepo;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-fts-esc-"));
    db = openHubDb({
      dbPath: path.join(tmp, "hub.db"),
      attachmentsDir: path.join(tmp, "attachments"),
    });
    repo = new SessionRepo(db);
    repo.mirror({
      machine_id: "m",
      harness: "claude_code",
      native_id: "n1",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:00:00Z",
      transcript_content: "tailscale 모바일 가이드 — quoted \"section\" with (parens) and OR keywords",
      content_hash: "h",
      events: [],
    });
    repo.mirror({
      machine_id: "m",
      harness: "codex",
      native_id: "n2",
      started_at: "2026-04-30T00:00:01Z",
      last_active_at: "2026-04-30T00:00:01Z",
      transcript_content: "another body about retriever and FTS5 escape edge cases",
      content_hash: "h2",
      events: [],
    });
  });
  afterEach(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

  test("ordinary query still matches", () => {
    expect(repo.search("tailscale", {}).length).toBeGreaterThan(0);
  });

  test("query with embedded double-quote does not throw", () => {
    expect(() => repo.search('foo"bar', {})).not.toThrow();
    // Should match nothing meaningful, but must not error
    const r = repo.search('section"with', {});
    expect(Array.isArray(r)).toBe(true);
  });

  test("query with FTS5 reserved operator (lowercase or surrounded) is not interpreted as operator", () => {
    // 'OR' as a bareword would be an operator. We strip the reserved bareword
    // 'OR' (uppercase only); lowercase 'or' is just a token.
    const r = repo.search("OR keywords", {});
    expect(Array.isArray(r)).toBe(true);
    // 'keywords' should still match the seeded transcript
    expect(r.length).toBeGreaterThan(0);
  });

  test("query with parens / colon / bracket is sanitized", () => {
    expect(() => repo.search("(parens)", {})).not.toThrow();
    expect(() => repo.search("col:on", {})).not.toThrow();
    expect(() => repo.search("[bracket]", {})).not.toThrow();
    expect(() => repo.search("^caret", {})).not.toThrow();
    // Body-only token survives wrapping
    const r = repo.search("(parens)", {});
    expect(r.length).toBeGreaterThan(0);
  });

  test("prefix wildcard preserved", () => {
    // 'tail*' should match 'tailscale'
    const r = repo.search("tail*", {});
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].session_uid.endsWith(":n1")).toBe(true);
  });

  test("empty / whitespace-only query returns []", () => {
    expect(repo.search("", {})).toEqual([]);
    expect(repo.search("   ", {})).toEqual([]);
    // After stripping reserved + empties, all-tokens-removed query also returns []
    expect(repo.search("AND", {})).toEqual([]);
  });

  test("multi-token query becomes implicit AND of phrases", () => {
    // 'tailscale 모바일' — both tokens should appear in the transcript
    const r = repo.search("tailscale 모바일", {});
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].session_uid.endsWith(":n1")).toBe(true);
  });
});
