import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import type { Note } from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  path        TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  title       TEXT,
  frontmatter TEXT,
  mtime       INTEGER,
  last_linted INTEGER
);

CREATE TABLE IF NOT EXISTS links (
  src      TEXT NOT NULL,
  dst      TEXT NOT NULL,
  resolved INTEGER NOT NULL,
  PRIMARY KEY (src, dst)
);

CREATE TABLE IF NOT EXISTS tags (
  path TEXT NOT NULL,
  tag  TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);

CREATE INDEX IF NOT EXISTS idx_links_dst ON links(dst);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
`;

export interface NoteRow {
  path: string;
  hash: string;
  title: string | null;
  frontmatter: string | null;
  mtime: number | null;
  last_linted: number | null;
}

export class IndexDB {
  private db: Database.Database;

  constructor(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  getNote(notePath: string): NoteRow | null {
    const row = this.db
      .prepare("SELECT * FROM notes WHERE path = ?")
      .get(notePath) as NoteRow | undefined;
    return row ?? null;
  }

  /** Returns the set of paths whose hash differs from the stored value, plus
   *  newly seen paths. */
  diff(notes: Note[]): { changed: string[]; added: string[]; removed: string[] } {
    const existing = new Map<string, string>();
    for (const row of this.db
      .prepare("SELECT path, hash FROM notes")
      .all() as { path: string; hash: string }[]) {
      existing.set(row.path, row.hash);
    }

    const seen = new Set<string>();
    const changed: string[] = [];
    const added: string[] = [];
    for (const note of notes) {
      seen.add(note.path);
      const prev = existing.get(note.path);
      if (prev === undefined) {
        added.push(note.path);
      } else if (prev !== note.hash) {
        changed.push(note.path);
      }
    }
    const removed: string[] = [];
    for (const path of existing.keys()) {
      if (!seen.has(path)) removed.push(path);
    }
    return { changed, added, removed };
  }

  upsertAll(notes: Note[]): void {
    const upsertNote = this.db.prepare<[
      string, string, string | null, string | null, number, number
    ]>(
      `INSERT INTO notes (path, hash, title, frontmatter, mtime, last_linted)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         hash = excluded.hash,
         title = excluded.title,
         frontmatter = excluded.frontmatter,
         mtime = excluded.mtime,
         last_linted = excluded.last_linted`
    );
    const deleteLinks = this.db.prepare("DELETE FROM links WHERE src = ?");
    const deleteTags = this.db.prepare("DELETE FROM tags WHERE path = ?");
    const insertLink = this.db.prepare<[string, string, number]>(
      "INSERT OR REPLACE INTO links (src, dst, resolved) VALUES (?, ?, ?)"
    );
    const insertTag = this.db.prepare<[string, string]>(
      "INSERT OR IGNORE INTO tags (path, tag) VALUES (?, ?)"
    );

    const now = Math.floor(Date.now() / 1000);
    const tx = this.db.transaction((batch: Note[]) => {
      for (const note of batch) {
        upsertNote.run(
          note.path,
          note.hash,
          note.h1,
          note.frontmatter ? JSON.stringify(note.frontmatter) : null,
          Math.floor(note.mtime),
          now
        );
        deleteLinks.run(note.path);
        deleteTags.run(note.path);
        for (const link of note.wikilinks) {
          insertLink.run(note.path, link.target, 0);
        }
        for (const tag of note.tags) {
          insertTag.run(note.path, tag);
        }
      }
    });
    tx(notes);
  }

  removePaths(paths: string[]): void {
    const delNote = this.db.prepare("DELETE FROM notes WHERE path = ?");
    const delLinks = this.db.prepare("DELETE FROM links WHERE src = ?");
    const delTags = this.db.prepare("DELETE FROM tags WHERE path = ?");
    const tx = this.db.transaction((list: string[]) => {
      for (const p of list) {
        delNote.run(p);
        delLinks.run(p);
        delTags.run(p);
      }
    });
    tx(paths);
  }
}
