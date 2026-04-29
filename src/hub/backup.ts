import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { logger } from "../utils/logger.js";

/**
 * SQLite header — used to validate user-supplied restore files before they
 * touch the live hub.db location.
 */
const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "utf8");

export interface BackupResult {
  source: string;
  target: string;
  bytes: number;
}

/**
 * Online backup of a hub SQLite database to a target path. Uses
 * `VACUUM INTO` so writers don't need to be paused — SQLite produces a
 * consistent compacted snapshot at the new location. The target path's
 * parent dir is created if missing. Refuses to overwrite an existing target
 * unless `overwrite: true`.
 */
export function backupHubDb(opts: {
  source: string;
  target: string;
  overwrite?: boolean;
}): BackupResult {
  if (!fs.existsSync(opts.source)) {
    throw new Error(`source DB not found: ${opts.source}`);
  }
  if (fs.existsSync(opts.target) && !opts.overwrite) {
    throw new Error(`target exists: ${opts.target} (pass overwrite=true to replace)`);
  }
  fs.mkdirSync(path.dirname(opts.target), { recursive: true });
  if (opts.overwrite && fs.existsSync(opts.target)) fs.rmSync(opts.target);

  const db = new Database(opts.source, { readonly: true });
  try {
    // VACUUM INTO yields a consistent compacted copy. SQLite holds a shared
    // lock briefly; concurrent readers/writers are not blocked beyond that.
    db.prepare(`VACUUM INTO ?`).run(opts.target);
  } finally {
    db.close();
  }

  const stat = fs.statSync(opts.target);
  logger.info("hub_db_backup", {
    source: opts.source,
    target: opts.target,
    bytes: stat.size,
  });
  return { source: opts.source, target: opts.target, bytes: stat.size };
}

export interface RestoreResult {
  source: string;
  target: string;
  preservedAs: string | null;
  bytes: number;
}

/**
 * Replace the live hub DB with a previously-backed-up file.
 *
 * Safety rails:
 *   - Validates source has the SQLite magic header.
 *   - If the target already exists, it is renamed to `<target>.<ts>.bak` first.
 *   - File copy is atomic on POSIX (rename of a temp copy in the same dir).
 */
export function restoreHubDb(opts: {
  source: string;
  target: string;
}): RestoreResult {
  if (!fs.existsSync(opts.source)) {
    throw new Error(`restore source not found: ${opts.source}`);
  }
  const head = Buffer.alloc(SQLITE_MAGIC.length);
  const fd = fs.openSync(opts.source, "r");
  try {
    fs.readSync(fd, head, 0, SQLITE_MAGIC.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (!head.equals(SQLITE_MAGIC)) {
    throw new Error(`restore source is not a SQLite database: ${opts.source}`);
  }

  fs.mkdirSync(path.dirname(opts.target), { recursive: true });

  let preservedAs: string | null = null;
  if (fs.existsSync(opts.target)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    preservedAs = `${opts.target}.${ts}.bak`;
    fs.renameSync(opts.target, preservedAs);
  }

  // Atomic-ish: copy to sibling temp then rename
  const tmp = opts.target + ".tmp";
  fs.copyFileSync(opts.source, tmp);
  fs.renameSync(tmp, opts.target);

  const bytes = fs.statSync(opts.target).size;
  logger.info("hub_db_restore", {
    source: opts.source,
    target: opts.target,
    preserved_as: preservedAs,
    bytes,
  });
  return { source: opts.source, target: opts.target, preservedAs, bytes };
}
