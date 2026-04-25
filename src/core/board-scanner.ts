import * as fs from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";

export interface ProjectHub {
  filePath: string;
  project_id: string;
  status: string;
  health: string;
  priority: string;
  phase?: string;
  updated?: string;
  next_task?: string;
  stalled_since?: string | null;
  목적?: string;
  목표?: string;
}

export interface TaskTicket {
  filePath: string;
  task_id: string;
  project: string;
  status: string;
  priority: string;
  task_type?: string;
  updated?: string;
  completed_at?: string | null;
  stalled_since?: string | null;
  estimated_hours?: number | null;
  attachments_count: number;
  completion_total: number;
  completion_done: number;
}

export interface BoardScan {
  projects: ProjectHub[];
  tasks: TaskTicket[];
}

interface FrontmatterRaw {
  type?: string;
  [key: string]: unknown;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

export function parseFrontmatter(content: string): FrontmatterRaw | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;
  try {
    const parsed = yaml.load(match[1]);
    if (parsed && typeof parsed === "object") return parsed as FrontmatterRaw;
    return null;
  } catch {
    return null;
  }
}

async function readFrontmatter(filePath: string): Promise<FrontmatterRaw | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return parseFrontmatter(content);
  } catch {
    return null;
  }
}

async function walkMdFiles(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_dashboard" || entry.name === "_derived") continue;
        if (entry.name.startsWith(".")) continue;
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push(full);
      }
    }
  }
  await walk(rootDir);
  return out;
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function asNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export async function scanBoard(vaultPath: string): Promise<BoardScan> {
  const files = await walkMdFiles(vaultPath);
  const projects: ProjectHub[] = [];
  const tasks: TaskTicket[] = [];

  for (const filePath of files) {
    const fm = await readFrontmatter(filePath);
    if (!fm || !fm.type) continue;

    if (fm.type === "project") {
      const project_id = asString(fm.project_id);
      if (!project_id) continue;
      projects.push({
        filePath,
        project_id,
        status: asString(fm.status, "active"),
        health: asString(fm.health, "green"),
        priority: asString(fm.priority, "med"),
        phase: asString(fm.phase) || undefined,
        updated: asString(fm.updated) || undefined,
        next_task: asString(fm.next_task) || undefined,
        stalled_since: asNullableString(fm.stalled_since),
        목적: asString(fm["목적"]) || undefined,
        목표: asString(fm["목표"]) || undefined,
      });
    } else if (fm.type === "task") {
      const task_id = asString(fm.task_id);
      const project = asString(fm.project);
      if (!task_id || !project) continue;

      const criteria = Array.isArray(fm.completion_criteria)
        ? fm.completion_criteria
        : [];
      const attachments = Array.isArray(fm.attachments) ? fm.attachments : [];
      const criteriaDone = countCompletedCriteria(filePath, criteria.length);

      tasks.push({
        filePath,
        task_id,
        project,
        status: asString(fm.status, "todo"),
        priority: asString(fm.priority, "med"),
        task_type: asString(fm.task_type) || undefined,
        updated: asString(fm.updated) || undefined,
        completed_at: asNullableString(fm.completed_at),
        stalled_since: asNullableString(fm.stalled_since),
        estimated_hours: asNumber(fm.estimated_hours),
        attachments_count: attachments.length,
        completion_total: criteria.length,
        completion_done: await criteriaDone,
      });
    }
  }

  return { projects, tasks };
}

async function countCompletedCriteria(filePath: string, total: number): Promise<number> {
  if (total === 0) return 0;
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const matches = content.match(/^- \[x\] /gim);
    return matches ? Math.min(matches.length, total) : 0;
  } catch {
    return 0;
  }
}
