import type {
  NormalizedEvent,
  NormalizedEventPayload,
  ParseResult,
} from "./types.js";

interface CodexLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

export interface ParseCodexOptions {
  /** Used when session_meta is missing (rare). Typically `path.basename(file, ".jsonl")`. */
  fallbackNativeId?: string;
}

/**
 * Parse a Codex CLI session jsonl into normalized events.
 *
 * Top-level Codex line types: `session_meta`, `turn_context`, `event_msg`,
 * `response_item`. The discriminator we care about lives in `payload.type`.
 */
export function parseCodexJsonl(
  content: string,
  options: ParseCodexOptions = {}
): ParseResult {
  const events: NormalizedEvent[] = [];
  const meta: Record<string, unknown> = {};
  let cwd_at_start: string | null = null;
  let started_at: string | null = null;
  let last_active_at: string | null = null;
  let seq = 0;

  const trackTs = (ts: string | undefined): string | null => {
    if (!ts) return null;
    if (started_at === null || ts < started_at) started_at = ts;
    if (last_active_at === null || ts > last_active_at) last_active_at = ts;
    return ts;
  };

  for (const rawLine of content.split("\n")) {
    if (!rawLine.trim()) continue;
    let obj: CodexLine;
    try {
      obj = JSON.parse(rawLine) as CodexLine;
    } catch {
      continue;
    }

    const ts = trackTs(obj.timestamp);
    if (!ts) continue;

    const payload = obj.payload ?? {};
    const sub = typeof payload.type === "string" ? payload.type : undefined;

    switch (obj.type) {
      case "session_meta": {
        if (typeof payload.id === "string" && !meta.native_id) {
          meta.native_id = payload.id;
        }
        if (
          typeof payload.cwd === "string" &&
          payload.cwd &&
          cwd_at_start === null
        ) {
          cwd_at_start = payload.cwd;
        }
        events.push({
          seq: seq++,
          ts,
          event_type: "meta",
          payload: { extra: { kind: "session_meta", id: payload.id } },
        });
        break;
      }
      case "turn_context": {
        if (
          typeof payload.cwd === "string" &&
          payload.cwd &&
          cwd_at_start === null
        ) {
          cwd_at_start = payload.cwd;
        }
        events.push({
          seq: seq++,
          ts,
          event_type: "meta",
          payload: { extra: { kind: "turn_context" } },
        });
        break;
      }
      case "event_msg": {
        if (sub === "user_message") {
          events.push({
            seq: seq++,
            ts,
            event_type: "user_msg",
            payload: { text: stringValue(payload.message) },
          });
        } else if (sub === "agent_message") {
          events.push({
            seq: seq++,
            ts,
            event_type: "assistant_msg",
            payload: { text: stringValue(payload.message) },
          });
        } else {
          events.push({
            seq: seq++,
            ts,
            event_type: "meta",
            payload: { extra: { kind: `event_msg:${sub ?? "?"}` } },
          });
        }
        break;
      }
      case "response_item": {
        seq = handleResponseItem(payload, sub, ts, seq, events);
        break;
      }
      default:
        events.push({
          seq: seq++,
          ts,
          event_type: "meta",
          payload: { extra: { kind: obj.type ?? "unknown" } },
        });
    }
  }

  if (!meta.native_id && options.fallbackNativeId) {
    meta.native_id = options.fallbackNativeId;
  }

  return { events, started_at, last_active_at, cwd_at_start, meta };
}

function handleResponseItem(
  payload: Record<string, unknown>,
  sub: string | undefined,
  ts: string,
  seq: number,
  events: NormalizedEvent[]
): number {
  if (sub === "function_call") {
    const name = stringValue(payload.name) || "unknown";
    let args: Record<string, unknown> = {};
    const rawArgs = payload.arguments;
    if (typeof rawArgs === "string") {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        args = { raw: rawArgs };
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, unknown>;
    }
    const eventPayload: NormalizedEventPayload = { args };
    const filePath = pickString(args, ["file_path", "path"]);
    if (filePath) eventPayload.file_path = filePath;
    const command = pickString(args, ["command", "cmd"]);
    if (command) eventPayload.command = command;
    events.push({
      seq: seq++,
      ts,
      event_type: "tool_use",
      tool_name: name,
      payload: eventPayload,
    });
  } else if (sub === "function_call_output") {
    const output = stringValue(payload.output);
    events.push({
      seq: seq++,
      ts,
      event_type: "tool_result",
      payload: { result_text: output, is_error: false },
    });
  } else if (sub === "reasoning") {
    events.push({
      seq: seq++,
      ts,
      event_type: "thinking",
      payload: {},
    });
  } else if (sub === "message") {
    const role = stringValue(payload.role);
    const text = extractInputText(payload.content);
    if (role === "user") {
      events.push({
        seq: seq++,
        ts,
        event_type: "user_msg",
        payload: { text },
      });
    } else if (role === "assistant") {
      events.push({
        seq: seq++,
        ts,
        event_type: "assistant_msg",
        payload: { text },
      });
    } else {
      events.push({
        seq: seq++,
        ts,
        event_type: "system",
        payload: { text },
      });
    }
  } else {
    events.push({
      seq: seq++,
      ts,
      event_type: "meta",
      payload: { extra: { kind: `response_item:${sub ?? "?"}` } },
    });
  }
  return seq;
}

function stringValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return JSON.stringify(v);
}

function pickString(
  args: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = args[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

function extractInputText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (item && typeof item === "object") {
      const t = (item as { text?: string }).text;
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.join("\n");
}
