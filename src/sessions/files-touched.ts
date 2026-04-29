import type { FileOp, NormalizedEvent, SessionFilesTouchedRow } from "./types.js";

const OP_RANK: Record<FileOp, number> = {
  read: 1,
  rename: 2,
  edit: 3,
  delete: 4,
  write: 5,
};

const TOOL_TO_OP: Record<string, FileOp> = {
  // Claude Code
  Read: "read",
  NotebookRead: "read",
  Edit: "edit",
  NotebookEdit: "edit",
  Write: "write",
  NotebookWrite: "write",
  // Codex (best-effort heuristics)
  read_file: "read",
  apply_patch: "edit",
  write_file: "write",
};

export function classifyOp(toolName: string | undefined): FileOp {
  if (!toolName) return "read";
  return TOOL_TO_OP[toolName] ?? "read";
}

/**
 * Aggregate `tool_use` events with file_path into per-file rows.
 * primary_op = strongest op observed (write > delete > edit > rename > read).
 */
export function deriveFilesTouched(
  session_uid: string,
  events: NormalizedEvent[]
): SessionFilesTouchedRow[] {
  const map = new Map<string, SessionFilesTouchedRow>();
  for (const ev of events) {
    if (ev.event_type !== "tool_use") continue;
    const filePath = ev.payload.file_path;
    if (!filePath) continue;
    const op = classifyOp(ev.tool_name);
    const existing = map.get(filePath);
    if (!existing) {
      map.set(filePath, {
        session_uid,
        file_path: filePath,
        first_touch_at: ev.ts,
        last_touch_at: ev.ts,
        touch_count: 1,
        primary_op: op,
      });
    } else {
      existing.touch_count += 1;
      if (ev.ts < existing.first_touch_at) existing.first_touch_at = ev.ts;
      if (ev.ts > existing.last_touch_at) existing.last_touch_at = ev.ts;
      if (OP_RANK[op] > OP_RANK[existing.primary_op]) {
        existing.primary_op = op;
      }
    }
  }
  return [...map.values()];
}
