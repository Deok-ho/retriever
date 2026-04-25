import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import { MIGRATIONS } from "./migrations.js";

export interface HubDbConfig {
  dbPath: string;
  attachmentsDir: string;
}

export function loadHubDbConfig(): HubDbConfig {
  const hubDir = process.env.RTV_HUB_DIR ?? path.join(process.env.HOME ?? "", ".rtv-hub");
  return {
    dbPath: path.join(hubDir, "hub.db"),
    attachmentsDir: path.join(hubDir, "attachments"),
  };
}

export function openHubDb(config: HubDbConfig): Database.Database {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.attachmentsDir, { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set<number>(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((r) => (r as { version: number }).version)
  );

  const recordMigration = db.prepare(
    "INSERT INTO schema_migrations (version) VALUES (?)"
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec(m.sql);
    recordMigration.run(m.version);
  }
}
