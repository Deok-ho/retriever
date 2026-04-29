import type {
  NormalizedEvent,
  NormalizedEventPayload,
  ParseResult,
} from "./types.js";

interface RawLine {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  attachment?: unknown;
  subtype?: string;
}

/**
 * Parse a Claude Code session jsonl into normalized events.
 *
 * Claude Code line types observed in real captures: `user`, `assistant`, `system`,
 * `attachment`, `last-prompt`, `permission-mode`, `file-history-snapshot`.
 * Bookkeeping types lacking a timestamp are dropped (cannot be inserted into
 * `session_events` which requires `ts NOT NULL`).
 */
export function parseClaudeCodeJsonl(content: string): ParseResult {
  const events: NormalizedEvent[] = [];
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
    let obj: RawLine;
    try {
      obj = JSON.parse(rawLine) as RawLine;
    } catch {
      continue;
    }

    const ts = trackTs(obj.timestamp);
    if (cwd_at_start === null && typeof obj.cwd === "string" && obj.cwd) {
      cwd_at_start = obj.cwd;
    }

    if (!ts) continue; // skip bookkeeping w/o ts

    switch (obj.type) {
      case "user":
        seq = handleUser(obj, ts, seq, events);
        break;
      case "assistant":
        seq = handleAssistant(obj, ts, seq, events);
        break;
      case "system":
        events.push({
          seq: seq++,
          ts,
          event_type: "system",
          payload: { extra: { subtype: obj.subtype } },
        });
        break;
      case "attachment":
        events.push({
          seq: seq++,
          ts,
          event_type: "meta",
          payload: { extra: { kind: "attachment" } },
        });
        break;
      default:
        events.push({
          seq: seq++,
          ts,
          event_type: "meta",
          payload: { extra: { kind: obj.type ?? "unknown" } },
        });
    }
  }

  return { events, started_at, last_active_at, cwd_at_start, meta: {} };
}

function handleUser(
  obj: RawLine,
  ts: string,
  seq: number,
  events: NormalizedEvent[]
): number {
  const content = obj.message?.content;
  if (typeof content === "string") {
    events.push({
      seq: seq++,
      ts,
      event_type: "user_msg",
      payload: { text: content },
    });
    return seq;
  }
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const part = item as { type?: string; text?: string; content?: unknown; is_error?: boolean; tool_use_id?: string };
      if (part.type === "tool_result") {
        const resultText =
          typeof part.content === "string"
            ? part.content
            : Array.isArray(part.content)
              ? extractTextFromArray(part.content)
              : JSON.stringify(part.content ?? null);
        events.push({
          seq: seq++,
          ts,
          event_type: "tool_result",
          payload: {
            result_text: resultText,
            is_error: part.is_error === true,
            extra: { tool_use_id: part.tool_use_id },
          },
        });
      } else if (part.type === "text" && typeof part.text === "string") {
        events.push({
          seq: seq++,
          ts,
          event_type: "user_msg",
          payload: { text: part.text },
        });
      }
    }
  }
  return seq;
}

function handleAssistant(
  obj: RawLine,
  ts: string,
  seq: number,
  events: NormalizedEvent[]
): number {
  const content = obj.message?.content;
  if (!Array.isArray(content)) return seq;
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const part = item as {
      type?: string;
      text?: string;
      thinking?: string;
      name?: string;
      input?: Record<string, unknown>;
      id?: string;
    };
    if (part.type === "text" && typeof part.text === "string") {
      events.push({
        seq: seq++,
        ts,
        event_type: "assistant_msg",
        payload: { text: part.text },
      });
    } else if (part.type === "thinking") {
      events.push({
        seq: seq++,
        ts,
        event_type: "thinking",
        payload: typeof part.thinking === "string" && part.thinking
          ? { text: part.thinking }
          : {},
      });
    } else if (part.type === "tool_use" && typeof part.name === "string") {
      const args = part.input ?? {};
      const payload: NormalizedEventPayload = { args };
      const filePath = pickString(args, [
        "file_path",
        "path",
        "notebook_path",
      ]);
      if (filePath) payload.file_path = filePath;
      const command = pickString(args, ["command"]);
      if (command) payload.command = command;
      events.push({
        seq: seq++,
        ts,
        event_type: "tool_use",
        tool_name: part.name,
        payload,
      });
    }
  }
  return seq;
}

function extractTextFromArray(arr: unknown[]): string {
  const parts: string[] = [];
  for (const item of arr) {
    if (item && typeof item === "object") {
      const t = (item as { text?: string }).text;
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.join("\n");
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
