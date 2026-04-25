import type Database from "better-sqlite3";
import type {
  Ticket,
  TicketFull,
  CreateTicketInput,
  ListTicketsFilter,
  CompletionCriterion,
  Attachment,
  TicketStatus,
} from "../types.js";

export class TicketRepo {
  constructor(private db: Database.Database) {}

  create(input: CreateTicketInput): TicketFull {
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO tickets (
             project_id, task_id, status, priority, task_type, summary, body,
             estimated_hours, intake_source, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.project_id,
          input.task_id,
          input.status ?? "todo",
          input.priority ?? "med",
          input.task_type ?? null,
          input.summary,
          input.body ?? "",
          input.estimated_hours ?? null,
          input.intake_source ?? "manual",
          now,
          now
        );

      if (input.completion_criteria) {
        const crit = this.db.prepare(
          "INSERT INTO completion_criteria (project_id, task_id, idx, text, done) VALUES (?, ?, ?, ?, 0)"
        );
        input.completion_criteria.forEach((text, i) => {
          crit.run(input.project_id, input.task_id, i, text);
        });
      }

      if (input.context_refs) {
        const ref = this.db.prepare(
          "INSERT INTO context_refs (project_id, task_id, ref) VALUES (?, ?, ?)"
        );
        input.context_refs.forEach((r) => ref.run(input.project_id, input.task_id, r));
      }
    });
    tx();
    return this.readFull(input.project_id, input.task_id)!;
  }

  read(project_id: string, task_id: string): Ticket | null {
    const row = this.db
      .prepare("SELECT * FROM tickets WHERE project_id = ? AND task_id = ?")
      .get(project_id, task_id);
    return (row as Ticket) ?? null;
  }

  readFull(project_id: string, task_id: string): TicketFull | null {
    const base = this.read(project_id, task_id);
    if (!base) return null;

    const criteria = this.db
      .prepare(
        "SELECT idx, text, done FROM completion_criteria WHERE project_id = ? AND task_id = ? ORDER BY idx"
      )
      .all(project_id, task_id) as { idx: number; text: string; done: number }[];
    const attachments = this.db
      .prepare(
        "SELECT * FROM attachments WHERE project_id = ? AND task_id = ? ORDER BY added_at"
      )
      .all(project_id, task_id) as Attachment[];
    const refs = this.db
      .prepare("SELECT ref FROM context_refs WHERE project_id = ? AND task_id = ?")
      .all(project_id, task_id) as { ref: string }[];

    return {
      ...base,
      completion_criteria: criteria.map(
        (c): CompletionCriterion => ({ idx: c.idx, text: c.text, done: c.done === 1 })
      ),
      attachments,
      context_refs: refs.map((r) => r.ref),
    };
  }

  list(filter: ListTicketsFilter = {}): Ticket[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.project_id) {
      clauses.push("project_id = ?");
      params.push(filter.project_id);
    }
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      clauses.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      params.push(...statuses);
    }
    if (filter.priority) {
      clauses.push("priority = ?");
      params.push(filter.priority);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filter.limit ? `LIMIT ${Math.max(1, Math.floor(filter.limit))}` : "";

    return this.db
      .prepare(
        `SELECT * FROM tickets ${where} ORDER BY priority ASC, updated_at DESC ${limit}`
      )
      .all(...params) as Ticket[];
  }

  update(
    project_id: string,
    task_id: string,
    patch: Partial<Omit<Ticket, "project_id" | "task_id" | "created_at">>
  ): Ticket | null {
    const existing = this.read(project_id, task_id);
    if (!existing) return null;

    const fields = Object.keys(patch).filter(
      (k) => patch[k as keyof typeof patch] !== undefined
    );
    if (fields.length === 0) return existing;

    const now = new Date().toISOString();
    const assignments = [...fields.map((f) => `${f} = ?`), "updated_at = ?"].join(", ");
    const values = [
      ...fields.map((f) => patch[f as keyof typeof patch]),
      now,
      project_id,
      task_id,
    ];

    this.db
      .prepare(
        `UPDATE tickets SET ${assignments} WHERE project_id = ? AND task_id = ?`
      )
      .run(...values);
    return this.read(project_id, task_id);
  }

  setStatus(project_id: string, task_id: string, status: TicketStatus): Ticket | null {
    return this.update(project_id, task_id, { status });
  }

  markCompleted(project_id: string, task_id: string, learnings: string | null = null): Ticket | null {
    const now = new Date().toISOString();
    return this.update(project_id, task_id, {
      status: "done",
      completed_at: now,
      learnings,
    });
  }

  setCriterionDone(
    project_id: string,
    task_id: string,
    idx: number,
    done: boolean
  ): void {
    this.db
      .prepare(
        "UPDATE completion_criteria SET done = ? WHERE project_id = ? AND task_id = ? AND idx = ?"
      )
      .run(done ? 1 : 0, project_id, task_id, idx);
  }
}
