import type Database from "better-sqlite3";
import type { Project, UpsertProjectInput } from "../types.js";

export class ProjectRepo {
  constructor(private db: Database.Database) {}

  list(): Project[] {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY priority ASC, updated_at DESC")
      .all() as Project[];
  }

  get(project_id: string): Project | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE project_id = ?")
      .get(project_id);
    return (row as Project) ?? null;
  }

  upsert(input: UpsertProjectInput): Project {
    const existing = this.get(input.project_id);
    const now = new Date().toISOString();

    if (existing) {
      const merged: Project = {
        ...existing,
        ...Object.fromEntries(
          Object.entries(input).filter(([, v]) => v !== undefined)
        ),
        updated_at: now,
      } as Project;
      this.db
        .prepare(
          `UPDATE projects SET
             status = ?, health = ?, priority = ?, phase = ?,
             repo_path = ?, harness_project = ?, purpose = ?, goal = ?,
             context_budget = ?, next_task_id = ?, updated_at = ?
           WHERE project_id = ?`
        )
        .run(
          merged.status,
          merged.health,
          merged.priority,
          merged.phase,
          merged.repo_path,
          merged.harness_project,
          merged.purpose,
          merged.goal,
          merged.context_budget,
          merged.next_task_id,
          merged.updated_at,
          merged.project_id
        );
      return this.get(input.project_id)!;
    }

    const row: Project = {
      project_id: input.project_id,
      status: input.status ?? "active",
      health: input.health ?? "green",
      priority: input.priority ?? "med",
      phase: input.phase ?? null,
      repo_path: input.repo_path ?? null,
      harness_project: input.harness_project ?? null,
      purpose: input.purpose ?? null,
      goal: input.goal ?? null,
      context_budget: input.context_budget ?? 50000,
      next_task_id: input.next_task_id ?? null,
      stalled_since: null,
      created_at: now,
      updated_at: now,
    };
    this.db
      .prepare(
        `INSERT INTO projects (
           project_id, status, health, priority, phase, repo_path, harness_project,
           purpose, goal, context_budget, next_task_id, stalled_since, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.project_id,
        row.status,
        row.health,
        row.priority,
        row.phase,
        row.repo_path,
        row.harness_project,
        row.purpose,
        row.goal,
        row.context_budget,
        row.next_task_id,
        row.stalled_since,
        row.created_at,
        row.updated_at
      );
    return row;
  }
}
