import type { HubService } from "./service.js";
import type { Harness, NormalizedEvent, SessionStatus } from "../sessions/types.js";

export interface MirrorToolInput {
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

export function mirrorSession(hub: HubService, input: MirrorToolInput): string {
  const row = hub.sessions.mirror(input);
  return [
    `mirrored ${row.session_uid}`,
    `events=${row.events_total} bytes=${row.bytes_total}`,
    `last_active=${row.last_active_at}`,
  ].join(" · ");
}

export interface ListToolInput {
  machine_id?: string;
  harness?: Harness;
  project_id?: string;
  status?: SessionStatus;
  since?: string;
  until?: string;
  limit?: number;
}

export function listSessions(hub: HubService, input: ListToolInput): string {
  const rows = hub.sessions.list(input);
  if (rows.length === 0) return "세션 없음";
  return rows
    .map((s) => {
      const cwd = s.cwd_at_start ? ` cwd=${truncate(s.cwd_at_start, 50)}` : "";
      const proj = s.project_id ? ` proj=${s.project_id}` : "";
      return `[${s.harness}@${s.machine_id}] ${s.native_id} status=${s.status}${proj}${cwd}  last=${s.last_active_at} events=${s.events_total}`;
    })
    .join("\n");
}

export interface ReadToolInput {
  session_uid: string;
  include_transcript?: boolean;
  include_events?: boolean;
}

export function readSession(hub: HubService, input: ReadToolInput): string {
  const r = hub.sessions.read(input.session_uid, {
    include_transcript: input.include_transcript,
    include_events: input.include_events,
  });
  if (!r) return `세션 없음: ${input.session_uid}`;
  const lines: string[] = [];
  lines.push(
    `${r.session.session_uid}  status=${r.session.status} machine=${r.session.machine_id} harness=${r.session.harness}`
  );
  lines.push(
    `  started=${r.session.started_at} last=${r.session.last_active_at} events=${r.session.events_total} bytes=${r.session.bytes_total}`
  );
  if (r.session.cwd_at_start) lines.push(`  cwd=${r.session.cwd_at_start}`);
  if (r.session.project_id) lines.push(`  project=${r.session.project_id}`);
  const shas = JSON.parse(r.session.commit_shas_json) as string[];
  if (shas.length) lines.push(`  commits=${shas.join(",")}`);
  if (r.events) {
    lines.push("\nEVENTS:");
    for (const ev of r.events.slice(0, 50)) {
      const tn = ev.tool_name ? ` ${ev.tool_name}` : "";
      lines.push(`  #${ev.seq} ${ev.ts} ${ev.event_type}${tn}`);
    }
    if (r.events.length > 50)
      lines.push(`  …+${r.events.length - 50} more (use HTTP for full)`);
  }
  if (r.transcript) {
    lines.push(
      `\nTRANSCRIPT (${r.transcript.content.length} chars, hash=${r.transcript.content_hash})`
    );
  }
  return lines.join("\n");
}

export interface SearchToolInput {
  query: string;
  machine_id?: string;
  harness?: Harness;
  project_id?: string;
  limit?: number;
}

export function searchSessions(hub: HubService, input: SearchToolInput): string {
  const hits = hub.sessions.search(input.query, input);
  if (hits.length === 0) return `match 없음: ${input.query}`;
  return hits
    .map((h) => `${h.session_uid}  ${h.snippet.replace(/\s+/g, " ").slice(0, 200)}`)
    .join("\n");
}

export interface FilesToolInput {
  file_path: string;
  project_id?: string;
  limit?: number;
}

export function filesTouchedByPath(
  hub: HubService,
  input: FilesToolInput
): string {
  const rows = hub.sessions.filesTouched(input.file_path, input);
  if (rows.length === 0) return `이 파일을 만진 세션 없음: ${input.file_path}`;
  return rows
    .map(
      (r) =>
        `[${r.harness}@${r.machine_id}] ${r.native_id}  ${r.primary_op} ×${r.touch_count}  last=${r.last_active_at}`
    )
    .join("\n");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
