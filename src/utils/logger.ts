import * as crypto from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): LogLevel {
  const raw = (process.env.RTV_LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

let activeLevel: LogLevel = envLevel();

export function setLogLevel(level: LogLevel): void {
  activeLevel = level;
}

export function getLogLevel(): LogLevel {
  return activeLevel;
}

export interface LogFields {
  [k: string]: unknown;
  msg?: string;
  req_id?: string;
  err?: unknown;
}

/**
 * Emit a single JSON line on stderr. Stable shape:
 *   { ts, level, msg, ...fields }
 *
 * stderr (not stdout) so stdio MCP transports don't get polluted by logs.
 * Errors are stringified to a stable shape (message + stack).
 */
function emit(level: LogLevel, msg: string, fields: LogFields = {}): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[activeLevel]) return;
  const out: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (k === "err" && v instanceof Error) {
      out.err = { message: v.message, stack: v.stack };
    } else if (k !== "msg") {
      out[k] = v;
    }
  }
  try {
    process.stderr.write(JSON.stringify(out) + "\n");
  } catch {
    /* swallow — never crash the host on logging failure */
  }
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};

export function generateRequestId(): string {
  // 8 random bytes → 16 hex chars. Short enough for grep, long enough to avoid collisions.
  return crypto.randomBytes(8).toString("hex");
}
