export type Harness = "claude_code" | "codex" | "gemini" | "qwen" | "other";

export type SessionStatus = "active" | "idle" | "archived" | "cleared";

export type EventType =
  | "user_msg"
  | "assistant_msg"
  | "tool_use"
  | "tool_result"
  | "thinking"
  | "system"
  | "meta";

export type FileOp = "read" | "edit" | "write" | "delete" | "rename";

export interface NormalizedEventPayload {
  text?: string;
  file_path?: string;
  command?: string;
  args?: Record<string, unknown>;
  result_text?: string;
  is_error?: boolean;
  /** Free-form extras, harness-specific */
  extra?: Record<string, unknown>;
}

export interface NormalizedEvent {
  seq: number;
  ts: string; // ISO8601 UTC
  event_type: EventType;
  tool_name?: string;
  payload: NormalizedEventPayload;
}

export interface ParseResult {
  events: NormalizedEvent[];
  started_at: string | null;
  last_active_at: string | null;
  cwd_at_start: string | null;
  /** Harness-specific extras the parser surfaces (e.g. native_id) */
  meta: Record<string, unknown>;
}

export interface SessionRow {
  session_uid: string;
  machine_id: string;
  harness: Harness;
  native_id: string;
  project_id: string | null;
  cwd_at_start: string | null;
  started_at: string;
  last_active_at: string;
  ended_at: string | null;
  status: SessionStatus;
  commit_shas_json: string;
  bytes_total: number;
  events_total: number;
  created_at: string;
  updated_at: string;
}

export interface SessionEventRow {
  id: number;
  session_uid: string;
  seq: number;
  ts: string;
  event_type: EventType;
  tool_name: string | null;
  payload_json: string;
  is_error: number;
}

export interface SessionFilesTouchedRow {
  session_uid: string;
  file_path: string;
  first_touch_at: string;
  last_touch_at: string;
  touch_count: number;
  primary_op: FileOp;
}

export interface SessionTranscriptRow {
  session_uid: string;
  content: string;
  content_hash: string;
  format: string;
  stored_at: string;
}
