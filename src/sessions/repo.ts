import type Database from "better-sqlite3";
import * as crypto from "node:crypto";
import type {
  Harness,
  NormalizedEvent,
  SessionEventRow,
  SessionFilesTouchedRow,
  SessionRow,
  SessionStatus,
  SessionTranscriptRow,
} from "./types.js";
import { deriveFilesTouched } from "./files-touched.js";

export interface MirrorInput {
  machine_id: string;
  harness: Harness;
  native_id: string;
  project_id?: string | null;
  cwd_at_start?: string | null;
  started_at: string;
  last_active_at: string;
  ended_at?: string | null;
  status?: SessionStatus;
  transcript_content: string;
  content_hash: string;
  events: NormalizedEvent[];
  commit_sha?: string | null;
}

export interface ListFilter {
  machine_id?: string;
  harness?: Harness;
  project_id?: string;
  status?: SessionStatus;
  since?: string; // last_active_at >= since
  until?: string; // last_active_at <= until
  limit?: number;
}

export interface SearchFilter {
  project_id?: string;
  machine_id?: string;
  harness?: Harness;
  limit?: number;
}

export interface SearchHit {
  session_uid: string;
  snippet: string;
  rank: number;
}

export interface SessionReadOptions {
  include_transcript?: boolean;
  include_events?: boolean;
  /** Inclusive lower-bound on seq when paginating events (returns rows with seq > this). */
  events_after_seq?: number;
  /** Cap on number of events returned (default 500, max 5000). */
  events_limit?: number;
}

export interface SessionRead {
  session: SessionRow;
  transcript?: SessionTranscriptRow;
  events?: SessionEventRow[];
  /** When events are paginated, last seq returned; null when at end. */
  events_next_cursor?: number | null;
  /** Total events for this session (matches `session.events_total`). */
  events_total?: number;
}

export interface FilesTouchedHit extends SessionRow {
  primary_op: string;
  touch_count: number;
}

export interface SessionSummary {
  first_user_msg: string;
  last_assistant_msg: string;
  tool_counts: Record<string, number>;
  errors_count: number;
  duration_seconds: number;
}

export interface DailyDigestRow extends SessionRow {
  summary: SessionSummary;
}

export interface DailyDigestFilter {
  since: string;
  until: string;
  machine_id?: string;
  harness?: Harness;
  limit?: number;
}

export class SessionRepo {
  constructor(private db: Database.Database) {}

  buildUid(machine_id: string, harness: Harness, native_id: string): string {
    return `${machine_id}:${harness}:${native_id}`;
  }

  /**
   * UPSERT session + transcript + replace events + recompute files_touched.
   * Append commit_sha to commit_shas_json (deduped).
   */
  mirror(input: MirrorInput): SessionRow {
    const session_uid = this.buildUid(
      input.machine_id,
      input.harness,
      input.native_id
    );
    const now = new Date().toISOString();
    const status: SessionStatus = input.status ?? "active";
    const bytes_total = Buffer.byteLength(input.transcript_content, "utf8");
    const events_total = input.events.length;

    // (Codex 주의급 #6) Server-side content_hash recompute. Caller may supply
    // a hash for differential push optimization, but we never trust it as
    // ground truth. Mismatches are logged (helps debug client bugs) but the
    // server-computed hash always wins.
    const computed = crypto
      .createHash("sha256")
      .update(input.transcript_content, "utf8")
      .digest("hex");
    if (input.content_hash && input.content_hash !== computed) {
      try {
        process.stderr.write(
          `[retriever] mirror: content_hash mismatch for ${session_uid} ` +
            `(client=${input.content_hash.slice(0, 8)}…, server=${computed.slice(0, 8)}…) — using server value\n`
        );
      } catch {
        /* stderr unavailable in some test runtimes */
      }
    }
    const trustedHash = computed;

    const tx = this.db.transaction(() => {
      const existing = this.db
        .prepare("SELECT commit_shas_json, created_at FROM sessions WHERE session_uid = ?")
        .get(session_uid) as { commit_shas_json: string; created_at: string } | undefined;

      const commit_shas: string[] = existing
        ? (JSON.parse(existing.commit_shas_json) as string[])
        : [];
      if (input.commit_sha && !commit_shas.includes(input.commit_sha)) {
        commit_shas.push(input.commit_sha);
      }

      this.db
        .prepare(
          `INSERT INTO sessions
            (session_uid, machine_id, harness, native_id, project_id, cwd_at_start,
             started_at, last_active_at, ended_at, status, commit_shas_json,
             bytes_total, events_total, created_at, updated_at)
           VALUES (@session_uid, @machine_id, @harness, @native_id, @project_id, @cwd_at_start,
                   @started_at, @last_active_at, @ended_at, @status, @commit_shas_json,
                   @bytes_total, @events_total, @created_at, @updated_at)
           ON CONFLICT(session_uid) DO UPDATE SET
             project_id = excluded.project_id,
             cwd_at_start = excluded.cwd_at_start,
             started_at = excluded.started_at,
             last_active_at = excluded.last_active_at,
             ended_at = excluded.ended_at,
             status = excluded.status,
             commit_shas_json = excluded.commit_shas_json,
             bytes_total = excluded.bytes_total,
             events_total = excluded.events_total,
             updated_at = excluded.updated_at`
        )
        .run({
          session_uid,
          machine_id: input.machine_id,
          harness: input.harness,
          native_id: input.native_id,
          project_id: input.project_id ?? null,
          cwd_at_start: input.cwd_at_start ?? null,
          started_at: input.started_at,
          last_active_at: input.last_active_at,
          ended_at: input.ended_at ?? null,
          status,
          commit_shas_json: JSON.stringify(commit_shas),
          bytes_total,
          events_total,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        });

      // Transcript UPSERT
      this.db
        .prepare(
          `INSERT INTO session_transcripts (session_uid, content, content_hash, format, stored_at)
           VALUES (?, ?, ?, 'jsonl-v1', ?)
           ON CONFLICT(session_uid) DO UPDATE SET
             content = excluded.content,
             content_hash = excluded.content_hash,
             stored_at = excluded.stored_at`
        )
        .run(session_uid, input.transcript_content, trustedHash, now);

      // Events: replace
      this.db
        .prepare("DELETE FROM session_events WHERE session_uid = ?")
        .run(session_uid);
      const insertEvent = this.db.prepare(
        `INSERT INTO session_events (session_uid, seq, ts, event_type, tool_name, payload_json, is_error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const ev of input.events) {
        insertEvent.run(
          session_uid,
          ev.seq,
          ev.ts,
          ev.event_type,
          ev.tool_name ?? null,
          JSON.stringify(ev.payload),
          ev.payload.is_error ? 1 : 0
        );
      }

      // Files touched: replace
      this.db
        .prepare("DELETE FROM session_files_touched WHERE session_uid = ?")
        .run(session_uid);
      const ftRows = deriveFilesTouched(session_uid, input.events);
      const insertFile = this.db.prepare(
        `INSERT INTO session_files_touched
           (session_uid, file_path, first_touch_at, last_touch_at, touch_count, primary_op)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const f of ftRows) {
        insertFile.run(
          f.session_uid,
          f.file_path,
          f.first_touch_at,
          f.last_touch_at,
          f.touch_count,
          f.primary_op
        );
      }
    });
    tx();

    return this.db
      .prepare("SELECT * FROM sessions WHERE session_uid = ?")
      .get(session_uid) as SessionRow;
  }

  list(filter: ListFilter): SessionRow[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.machine_id) {
      where.push("machine_id = ?");
      params.push(filter.machine_id);
    }
    if (filter.harness) {
      where.push("harness = ?");
      params.push(filter.harness);
    }
    if (filter.project_id) {
      where.push("project_id = ?");
      params.push(filter.project_id);
    }
    if (filter.status) {
      where.push("status = ?");
      params.push(filter.status);
    }
    if (filter.since) {
      where.push("last_active_at >= ?");
      params.push(filter.since);
    }
    if (filter.until) {
      where.push("last_active_at <= ?");
      params.push(filter.until);
    }
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 500));
    const sql = `SELECT * FROM sessions ${
      where.length ? "WHERE " + where.join(" AND ") : ""
    } ORDER BY last_active_at DESC LIMIT ?`;
    return this.db.prepare(sql).all(...params, limit) as SessionRow[];
  }

  read(session_uid: string, opts: SessionReadOptions): SessionRead | null {
    const session = this.db
      .prepare("SELECT * FROM sessions WHERE session_uid = ?")
      .get(session_uid) as SessionRow | undefined;
    if (!session) return null;
    const out: SessionRead = { session };
    if (opts.include_transcript) {
      out.transcript = this.db
        .prepare("SELECT * FROM session_transcripts WHERE session_uid = ?")
        .get(session_uid) as SessionTranscriptRow;
    }
    if (opts.include_events) {
      const limit = Math.max(1, Math.min(opts.events_limit ?? 500, 5000));
      const after = typeof opts.events_after_seq === "number" ? opts.events_after_seq : -1;
      const events = this.db
        .prepare(
          `SELECT * FROM session_events
           WHERE session_uid = ? AND seq > ?
           ORDER BY seq ASC LIMIT ?`
        )
        .all(session_uid, after, limit) as SessionEventRow[];
      out.events = events;
      out.events_total = session.events_total;
      // next_cursor = last seq if we filled the page (more may exist), else null
      out.events_next_cursor =
        events.length === limit && events.length > 0
          ? events[events.length - 1].seq
          : null;
    }
    return out;
  }

  search(query: string, filter: SearchFilter): SearchHit[] {
    const safe = sanitizeFtsQuery(query);
    if (!safe) return [];
    const limit = Math.max(1, Math.min(filter.limit ?? 50, 200));
    const params: unknown[] = [safe];
    let extraJoin = "";
    const where: string[] = [];
    if (filter.machine_id) {
      where.push("s.machine_id = ?");
      params.push(filter.machine_id);
    }
    if (filter.harness) {
      where.push("s.harness = ?");
      params.push(filter.harness);
    }
    if (filter.project_id) {
      where.push("s.project_id = ?");
      params.push(filter.project_id);
    }
    if (where.length) {
      extraJoin = "JOIN sessions s ON s.session_uid = fts.session_uid";
    }
    const sql = `
      SELECT fts.session_uid AS session_uid,
             snippet(session_transcripts_fts, 1, '[', ']', '…', 12) AS snippet,
             fts.rank AS rank
      FROM session_transcripts_fts AS fts
      ${extraJoin}
      WHERE fts.content MATCH ?
      ${where.length ? "AND " + where.join(" AND ") : ""}
      ORDER BY fts.rank
      LIMIT ?
    `;
    // Reorder params: MATCH binding first, then extra, then limit
    const orderedParams = [safe, ...params.slice(1), limit];
    return this.db.prepare(sql).all(...orderedParams) as SearchHit[];
  }

  /**
   * Per-session digest for "오늘 한 일" review:
   *   - first_user_msg: text of earliest user_msg (truncated)
   *   - last_assistant_msg: text of latest assistant_msg (truncated)
   *   - tool_counts: { ToolName: N } from tool_use events
   *   - errors_count: count of tool_result events with is_error=1
   *   - duration_seconds: last_active_at − started_at on the row
   */
  summarize(session_uid: string): SessionSummary | null {
    const session = this.db
      .prepare("SELECT started_at, last_active_at FROM sessions WHERE session_uid = ?")
      .get(session_uid) as { started_at: string; last_active_at: string } | undefined;
    if (!session) return null;
    const firstUser = this.db
      .prepare(
        `SELECT payload_json FROM session_events
         WHERE session_uid = ? AND event_type = 'user_msg'
         ORDER BY seq ASC LIMIT 1`
      )
      .get(session_uid) as { payload_json: string } | undefined;
    const lastAssistant = this.db
      .prepare(
        `SELECT payload_json FROM session_events
         WHERE session_uid = ? AND event_type = 'assistant_msg'
         ORDER BY seq DESC LIMIT 1`
      )
      .get(session_uid) as { payload_json: string } | undefined;
    const toolRows = this.db
      .prepare(
        `SELECT tool_name, COUNT(*) AS c FROM session_events
         WHERE session_uid = ? AND event_type = 'tool_use' AND tool_name IS NOT NULL
         GROUP BY tool_name`
      )
      .all(session_uid) as { tool_name: string; c: number }[];
    const errorsCount = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM session_events
           WHERE session_uid = ? AND event_type = 'tool_result' AND is_error = 1`
        )
        .get(session_uid) as { c: number }
    ).c;

    const tool_counts: Record<string, number> = {};
    for (const r of toolRows) tool_counts[r.tool_name] = r.c;

    const startedMs = Date.parse(session.started_at);
    const lastMs = Date.parse(session.last_active_at);
    const duration_seconds = Math.max(
      0,
      Math.round((isFinite(lastMs) && isFinite(startedMs) ? lastMs - startedMs : 0) / 1000)
    );

    return {
      first_user_msg: truncate(extractText(firstUser?.payload_json), 280),
      last_assistant_msg: truncate(extractText(lastAssistant?.payload_json), 280),
      tool_counts,
      errors_count: errorsCount,
      duration_seconds,
    };
  }

  /**
   * Daily digest — sessions whose last_active_at falls within [since, until],
   * each row enriched with a SessionSummary. Ordered by last_active_at desc.
   *
   * Performance: previously called {@link summarize} per session = O(N×4)
   * round-trips. Now uses 4 batch aggregates (first_user_msg / last_assistant_msg /
   * tool_counts / errors_count) over the windowed session_uid set, joined in
   * memory. Codex 주의급 #5 fix.
   */
  dailyDigest(filter: DailyDigestFilter): DailyDigestRow[] {
    const where: string[] = ["last_active_at >= ?", "last_active_at <= ?"];
    const params: unknown[] = [filter.since, filter.until];
    if (filter.machine_id) {
      where.push("machine_id = ?");
      params.push(filter.machine_id);
    }
    if (filter.harness) {
      where.push("harness = ?");
      params.push(filter.harness);
    }
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 500));
    const sessions = this.db
      .prepare(
        `SELECT * FROM sessions WHERE ${where.join(" AND ")}
         ORDER BY last_active_at DESC LIMIT ?`
      )
      .all(...params, limit) as SessionRow[];
    if (sessions.length === 0) return [];

    const uids = sessions.map((s) => s.session_uid);
    const placeholders = uids.map(() => "?").join(",");

    // Batch #1 — first user_msg per session (correlated MIN(seq) trick).
    const firstUserRows = this.db
      .prepare(
        `SELECT e.session_uid, e.payload_json
         FROM session_events e
         INNER JOIN (
           SELECT session_uid, MIN(seq) AS seq
           FROM session_events
           WHERE event_type = 'user_msg' AND session_uid IN (${placeholders})
           GROUP BY session_uid
         ) m ON m.session_uid = e.session_uid AND m.seq = e.seq
         WHERE e.event_type = 'user_msg'`
      )
      .all(...uids) as { session_uid: string; payload_json: string }[];
    const firstUser = new Map(firstUserRows.map((r) => [r.session_uid, r.payload_json]));

    // Batch #2 — last assistant_msg per session.
    const lastAsstRows = this.db
      .prepare(
        `SELECT e.session_uid, e.payload_json
         FROM session_events e
         INNER JOIN (
           SELECT session_uid, MAX(seq) AS seq
           FROM session_events
           WHERE event_type = 'assistant_msg' AND session_uid IN (${placeholders})
           GROUP BY session_uid
         ) m ON m.session_uid = e.session_uid AND m.seq = e.seq
         WHERE e.event_type = 'assistant_msg'`
      )
      .all(...uids) as { session_uid: string; payload_json: string }[];
    const lastAsst = new Map(lastAsstRows.map((r) => [r.session_uid, r.payload_json]));

    // Batch #3 — tool_counts.
    const toolRows = this.db
      .prepare(
        `SELECT session_uid, tool_name, COUNT(*) AS c
         FROM session_events
         WHERE event_type = 'tool_use' AND tool_name IS NOT NULL
           AND session_uid IN (${placeholders})
         GROUP BY session_uid, tool_name`
      )
      .all(...uids) as { session_uid: string; tool_name: string; c: number }[];
    const toolCounts = new Map<string, Record<string, number>>();
    for (const r of toolRows) {
      let bag = toolCounts.get(r.session_uid);
      if (!bag) { bag = {}; toolCounts.set(r.session_uid, bag); }
      bag[r.tool_name] = r.c;
    }

    // Batch #4 — errors_count.
    const errorRows = this.db
      .prepare(
        `SELECT session_uid, COUNT(*) AS c
         FROM session_events
         WHERE event_type = 'tool_result' AND is_error = 1
           AND session_uid IN (${placeholders})
         GROUP BY session_uid`
      )
      .all(...uids) as { session_uid: string; c: number }[];
    const errorCounts = new Map(errorRows.map((r) => [r.session_uid, r.c]));

    return sessions.map((s) => {
      const startedMs = Date.parse(s.started_at);
      const lastMs = Date.parse(s.last_active_at);
      const duration_seconds = Math.max(
        0,
        Math.round(
          (isFinite(lastMs) && isFinite(startedMs) ? lastMs - startedMs : 0) / 1000
        )
      );
      const summary: SessionSummary = {
        first_user_msg: truncate(extractText(firstUser.get(s.session_uid)), 280),
        last_assistant_msg: truncate(extractText(lastAsst.get(s.session_uid)), 280),
        tool_counts: toolCounts.get(s.session_uid) ?? {},
        errors_count: errorCounts.get(s.session_uid) ?? 0,
        duration_seconds,
      };
      return { ...s, summary };
    });
  }



  filesTouched(
    file_path: string,
    filter: { limit?: number; project_id?: string }
  ): FilesTouchedHit[] {
    const limit = Math.max(1, Math.min(filter.limit ?? 50, 200));
    const params: unknown[] = [file_path];
    const where: string[] = ["ft.file_path = ?"];
    if (filter.project_id) {
      where.push("s.project_id = ?");
      params.push(filter.project_id);
    }
    params.push(limit);
    return this.db
      .prepare(
        `SELECT s.*, ft.primary_op AS primary_op, ft.touch_count AS touch_count
         FROM session_files_touched ft
         JOIN sessions s ON s.session_uid = ft.session_uid
         WHERE ${where.join(" AND ")}
         ORDER BY s.last_active_at DESC
         LIMIT ?`
      )
      .all(...params) as FilesTouchedHit[];
  }
}

/**
 * Convert an arbitrary user search string into a safe FTS5 query.
 *
 * FTS5 has its own mini-grammar (AND/OR/NOT/NEAR, quoted phrases, prefix `*`,
 * column filters, `(` `)` grouping). Without escaping, a query like `bla"foo`
 * or `: foo` raises `SQLITE_ERROR: fts5: syntax error` and surfaces as 500.
 *
 * Strategy:
 *   - Split on whitespace into tokens.
 *   - Drop reserved bareword operators (AND/OR/NOT/NEAR — uppercase only).
 *   - Quote each token as a phrase, escaping any embedded `"` by doubling.
 *   - Keep a trailing `*` prefix marker if the token already ended with one
 *     (still valid FTS5 syntax outside quotes).
 *   - Drop tokens that become empty after stripping. Empty result → no search.
 */
function sanitizeFtsQuery(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const RESERVED = new Set(["AND", "OR", "NOT", "NEAR"]);
  const tokens = trimmed.split(/\s+/);
  const out: string[] = [];
  for (const tok of tokens) {
    if (RESERVED.has(tok)) continue; // strip bareword operators
    let body = tok;
    let prefix = false;
    if (body.endsWith("*")) { prefix = true; body = body.slice(0, -1); }
    // Strip characters FTS5 treats specially even inside our quote
    body = body.replace(/^[\(\)\[\]:^*]+|[\(\)\[\]:^*]+$/g, "");
    // Escape embedded double quotes by doubling (FTS5 phrase escape)
    body = body.replace(/"/g, '""');
    if (!body) continue;
    out.push(`"${body}"${prefix ? "*" : ""}`);
  }
  return out.join(" ");
}

function extractText(payload_json: string | undefined): string {
  if (!payload_json) return "";
  try {
    const obj = JSON.parse(payload_json) as { text?: string };
    return typeof obj.text === "string" ? obj.text : "";
  } catch {
    return "";
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
