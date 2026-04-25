import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

export interface QueuedOp {
  id: number;
  ts: string;
  tool_name: string;
  arguments_json: string;
  retry_count: number;
  last_error: string | null;
}

export interface ClientStateConfig {
  dbPath: string;
}

export function loadClientStateConfig(): ClientStateConfig {
  const dir = process.env.RTV_CLIENT_DIR ?? path.join(process.env.HOME ?? "", ".rtv-client");
  return { dbPath: path.join(dir, "state.db") };
}

/**
 * Offline write queue. Backed by a tiny SQLite file independent of the hub DB.
 * Survives restarts. FIFO order on flush.
 */
export class LocalQueue {
  readonly db: Database.Database;

  constructor(config: ClientStateConfig = loadClientStateConfig()) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    this.db = new Database(config.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS push_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        arguments_json TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
    `);
  }

  enqueue(tool_name: string, args: unknown): QueuedOp {
    const ts = new Date().toISOString();
    const argsJson = JSON.stringify(args ?? {});
    const info = this.db
      .prepare(
        "INSERT INTO push_queue (ts, tool_name, arguments_json) VALUES (?, ?, ?)"
      )
      .run(ts, tool_name, argsJson);
    return {
      id: Number(info.lastInsertRowid),
      ts,
      tool_name,
      arguments_json: argsJson,
      retry_count: 0,
      last_error: null,
    };
  }

  list(limit = 100): QueuedOp[] {
    return this.db
      .prepare("SELECT * FROM push_queue ORDER BY id ASC LIMIT ?")
      .all(Math.max(1, Math.floor(limit))) as QueuedOp[];
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM push_queue").get() as {
      c: number;
    };
    return row.c;
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM push_queue WHERE id = ?").run(id);
  }

  recordFailure(id: number, error: string): void {
    this.db
      .prepare(
        "UPDATE push_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?"
      )
      .run(error, id);
  }

  close(): void {
    this.db.close();
  }
}
