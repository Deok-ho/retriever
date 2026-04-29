import type Database from "better-sqlite3";
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
}

export interface SessionRead {
  session: SessionRow;
  transcript?: SessionTranscriptRow;
  events?: SessionEventRow[];
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
        .run(session_uid, input.transcript_content, input.content_hash, now);

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
      out.events = this.db
        .prepare(
          "SELECT * FROM session_events WHERE session_uid = ? ORDER BY seq ASC"
        )
        .all(session_uid) as SessionEventRow[];
    }
    return out;
  }

  search(query: string, filter: SearchFilter): SearchHit[] {
    if (!query.trim()) return [];
    const limit = Math.max(1, Math.min(filter.limit ?? 50, 200));
    const params: unknown[] = [query];
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
    const orderedParams = [query, ...params.slice(1), limit];
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
    return sessions.map((s) => ({
      ...s,
      summary: this.summarize(s.session_uid)!,
    }));
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
