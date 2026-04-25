import type Database from "better-sqlite3";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { Attachment, AttachmentType } from "../types.js";

export interface AttachFileInput {
  project_id: string;
  task_id: string;
  type: Exclude<AttachmentType, "external">;
  source_path: string; // 원본 파일 경로 (복사됨)
  filename?: string;   // 저장 파일명 override
}

export interface AttachUrlInput {
  project_id: string;
  task_id: string;
  url: string;
  note?: string;       // path 필드 대용
}

export interface AttachmentsRepoOpts {
  attachmentsDir: string;
}

export class AttachmentRepo {
  constructor(private db: Database.Database, private opts: AttachmentsRepoOpts) {}

  list(project_id: string, task_id: string): Attachment[] {
    return this.db
      .prepare(
        "SELECT * FROM attachments WHERE project_id = ? AND task_id = ? ORDER BY added_at"
      )
      .all(project_id, task_id) as Attachment[];
  }

  async attachFile(input: AttachFileInput): Promise<Attachment> {
    const sourceBytes = await fs.readFile(input.source_path);
    const content_hash = crypto.createHash("sha256").update(sourceBytes).digest("hex");
    const size_bytes = sourceBytes.byteLength;

    const ext = path.extname(input.source_path);
    const filename =
      input.filename ??
      `${input.type}-${content_hash.slice(0, 12)}${ext}`;

    const destDir = path.join(
      this.opts.attachmentsDir,
      input.project_id,
      input.task_id
    );
    await fs.mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, filename);
    await fs.writeFile(destPath, sourceBytes);

    const attachment_id = `${input.project_id}_${input.task_id}_${content_hash.slice(0, 8)}`;

    const added_at = new Date().toISOString();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO attachments (
           attachment_id, project_id, task_id, type, path, url,
           size_bytes, content_hash, summary_hash, added_at
         ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?)`
      )
      .run(
        attachment_id,
        input.project_id,
        input.task_id,
        input.type,
        destPath,
        size_bytes,
        content_hash,
        added_at
      );

    return {
      attachment_id,
      project_id: input.project_id,
      task_id: input.task_id,
      type: input.type,
      path: destPath,
      url: null,
      size_bytes,
      content_hash,
      summary_hash: null,
      added_at,
    };
  }

  attachUrl(input: AttachUrlInput): Attachment {
    const hash = crypto.createHash("sha256").update(input.url).digest("hex");
    const attachment_id = `${input.project_id}_${input.task_id}_${hash.slice(0, 8)}`;
    const added_at = new Date().toISOString();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO attachments (
           attachment_id, project_id, task_id, type, path, url,
           size_bytes, content_hash, summary_hash, added_at
         ) VALUES (?, ?, ?, 'external', ?, ?, NULL, NULL, NULL, ?)`
      )
      .run(
        attachment_id,
        input.project_id,
        input.task_id,
        input.note ?? null,
        input.url,
        added_at
      );

    return {
      attachment_id,
      project_id: input.project_id,
      task_id: input.task_id,
      type: "external",
      path: input.note ?? null,
      url: input.url,
      size_bytes: null,
      content_hash: null,
      summary_hash: null,
      added_at,
    };
  }

  async detach(attachment_id: string): Promise<boolean> {
    const row = this.db
      .prepare("SELECT * FROM attachments WHERE attachment_id = ?")
      .get(attachment_id) as Attachment | undefined;
    if (!row) return false;

    if (row.path && row.type !== "external") {
      try {
        await fs.unlink(row.path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }

    this.db
      .prepare("DELETE FROM attachments WHERE attachment_id = ?")
      .run(attachment_id);
    return true;
  }
}
