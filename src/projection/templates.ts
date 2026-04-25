import yaml from "js-yaml";
import type {
  Project,
  Ticket,
  TicketFull,
  CompletionCriterion,
  Attachment,
} from "../db/types.js";

const READONLY_BANNER =
  "<!-- managed by retriever-hub. Edits will be overwritten on next sync. -->";

/**
 * Frontmatter keys that the hub owns and overwrites on every sync.
 * Anything else is preserved (allows users to keep their own notes/tags).
 */
const MANAGED_PROJECT_KEYS = [
  "type",
  "project_id",
  "status",
  "health",
  "priority",
  "phase",
  "purpose",
  "goal",
  "next_task_id",
  "context_budget",
  "stalled_since",
  "managed_by",
  "updated",
] as const;

export function renderProjectHubManagedFm(p: Project): Record<string, unknown> {
  return {
    type: "project",
    project_id: p.project_id,
    status: p.status,
    health: p.health,
    priority: p.priority,
    phase: p.phase ?? null,
    purpose: p.purpose ?? null,
    goal: p.goal ?? null,
    next_task_id: p.next_task_id ?? null,
    context_budget: p.context_budget,
    stalled_since: p.stalled_since ?? null,
    managed_by: "retriever-hub",
    updated: p.updated_at,
  };
}

export function mergeProjectHubFrontmatter(
  existing: Record<string, unknown> | null,
  managed: Record<string, unknown>
): Record<string, unknown> {
  if (!existing) return managed;
  const result: Record<string, unknown> = { ...existing };
  for (const k of MANAGED_PROJECT_KEYS) {
    if (k in managed) result[k] = managed[k as keyof typeof managed];
  }
  return result;
}

export function renderTicketStub(ticket: TicketFull): string {
  const fm = {
    type: "task",
    project: ticket.project_id,
    task_id: ticket.task_id,
    status: ticket.status,
    priority: ticket.priority,
    task_type: ticket.task_type ?? null,
    summary: ticket.summary,
    estimated_hours: ticket.estimated_hours ?? null,
    actual_hours: ticket.actual_hours ?? null,
    completed_at: ticket.completed_at ?? null,
    stalled_since: ticket.stalled_since ?? null,
    intake_source: ticket.intake_source,
    managed_by: "retriever-hub",
    readonly: true,
    updated: ticket.updated_at,
  };

  const lines: string[] = [];
  lines.push("---");
  lines.push(yaml.dump(fm, { lineWidth: 120 }).trimEnd());
  lines.push("---");
  lines.push("");
  lines.push(READONLY_BANNER);
  lines.push("");
  lines.push(`# ${ticket.project_id}/${ticket.task_id}`);
  lines.push("");
  lines.push(`> ${ticket.summary}`);
  lines.push("");

  lines.push("## 메타");
  lines.push("");
  lines.push(`- status: \`${ticket.status}\``);
  lines.push(`- priority: \`${ticket.priority}\``);
  if (ticket.task_type) lines.push(`- type: \`${ticket.task_type}\``);
  if (ticket.estimated_hours != null) lines.push(`- estimated: ${ticket.estimated_hours}h`);
  if (ticket.actual_hours != null) lines.push(`- actual: ${ticket.actual_hours}h`);
  lines.push(`- updated: ${ticket.updated_at}`);
  if (ticket.completed_at) lines.push(`- completed_at: ${ticket.completed_at}`);
  lines.push("");

  if (ticket.completion_criteria.length > 0) {
    lines.push("## 완료 기준");
    lines.push("");
    ticket.completion_criteria.forEach((c: CompletionCriterion) => {
      lines.push(`- [${c.done ? "x" : " "}] ${c.text}`);
    });
    lines.push("");
  }

  if (ticket.attachments.length > 0) {
    lines.push("## 첨부");
    lines.push("");
    ticket.attachments.forEach((a: Attachment) => {
      const target = a.url ?? a.path ?? "(unknown)";
      lines.push(`- [${a.type}] \`${a.attachment_id}\` — ${target}`);
    });
    lines.push("");
  }

  if (ticket.context_refs.length > 0) {
    lines.push("## 관련 노트");
    lines.push("");
    ticket.context_refs.forEach((r) => {
      lines.push(`- ${r}`);
    });
    lines.push("");
  }

  if (ticket.body && ticket.body.trim().length > 0) {
    lines.push("## 본문");
    lines.push("");
    lines.push(ticket.body.trim());
    lines.push("");
  }

  if (ticket.learnings && ticket.learnings.trim().length > 0) {
    lines.push("## Learnings");
    lines.push("");
    lines.push(ticket.learnings.trim());
    lines.push("");
  }

  return lines.join("\n");
}

export interface BoardOpts {
  project_id?: string;
  narrative?: string | null;
}

export function renderPortfolioBoard(
  projects: Project[],
  ticketsByProject: Map<string, Ticket[]>,
  narrative: string | null = null
): string {
  const fm = {
    type: "dashboard",
    scope: "portfolio",
    managed_by: "retriever-hub",
    readonly: true,
    generated_at: new Date().toISOString(),
  };
  const lines: string[] = [];
  lines.push("---");
  lines.push(yaml.dump(fm, { lineWidth: 120 }).trimEnd());
  lines.push("---");
  lines.push("");
  lines.push(READONLY_BANNER);
  lines.push("");
  lines.push("# Portfolio Board");
  lines.push("");
  if (narrative) {
    lines.push("## Narrative");
    lines.push("");
    lines.push(narrative);
    lines.push("");
  }
  lines.push("## Projects");
  lines.push("");
  if (projects.length === 0) {
    lines.push("_등록된 프로젝트 없음_");
    lines.push("");
  } else {
    lines.push("| Project | Status | Health | Priority | Phase | Active | Next |");
    lines.push("|---------|--------|--------|----------|-------|-------:|------|");
    for (const p of projects) {
      const tickets = ticketsByProject.get(p.project_id) ?? [];
      const active = tickets.filter((t) => t.status !== "done" && t.status !== "blocked").length;
      lines.push(
        `| \`${p.project_id}\` | ${p.status} | ${p.health} | ${p.priority} | ${
          p.phase ?? "-"
        } | ${active} | ${p.next_task_id ?? "-"} |`
      );
    }
    lines.push("");
  }
  lines.push("## Active tickets (top 30 by priority)");
  lines.push("");
  const allActive = Array.from(ticketsByProject.values())
    .flat()
    .filter((t) => t.status === "todo" || t.status === "in_progress" || t.status === "review")
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 30);
  if (allActive.length === 0) {
    lines.push("_활성 티켓 없음_");
  } else {
    lines.push("| Project | Task | Status | Priority | Summary |");
    lines.push("|---------|------|--------|----------|---------|");
    for (const t of allActive) {
      lines.push(
        `| \`${t.project_id}\` | \`${t.task_id}\` | ${t.status} | ${t.priority} | ${escapeCell(t.summary)} |`
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function renderProjectBoard(
  project: Project,
  tickets: Ticket[],
  narrative: string | null = null
): string {
  const fm = {
    type: "dashboard",
    scope: "project",
    project_id: project.project_id,
    managed_by: "retriever-hub",
    readonly: true,
    generated_at: new Date().toISOString(),
  };
  const lines: string[] = [];
  lines.push("---");
  lines.push(yaml.dump(fm, { lineWidth: 120 }).trimEnd());
  lines.push("---");
  lines.push("");
  lines.push(READONLY_BANNER);
  lines.push("");
  lines.push(`# ${project.project_id} — Board`);
  lines.push("");
  lines.push(
    `status=\`${project.status}\`  health=\`${project.health}\`  priority=\`${project.priority}\`  phase=\`${
      project.phase ?? "-"
    }\``
  );
  lines.push("");
  if (project.purpose) lines.push(`- 목적: ${project.purpose}`);
  if (project.goal) lines.push(`- 목표: ${project.goal}`);
  if (project.next_task_id) lines.push(`- next_task: \`${project.next_task_id}\``);
  lines.push("");
  if (narrative) {
    lines.push("## Narrative");
    lines.push("");
    lines.push(narrative);
    lines.push("");
  }
  lines.push("## Tickets");
  lines.push("");
  if (tickets.length === 0) {
    lines.push("_티켓 없음_");
  } else {
    lines.push("| Status | Priority | Task | Summary |");
    lines.push("|--------|----------|------|---------|");
    const sorted = [...tickets].sort((a, b) => {
      const sa = statusRank(a.status);
      const sb = statusRank(b.status);
      if (sa !== sb) return sa - sb;
      return priorityRank(a.priority) - priorityRank(b.priority);
    });
    for (const t of sorted) {
      lines.push(
        `| ${t.status} | ${t.priority} | \`${t.task_id}\` | ${escapeCell(t.summary)} |`
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function priorityRank(p: string): number {
  if (p === "high") return 0;
  if (p === "med") return 1;
  return 2;
}

function statusRank(s: string): number {
  switch (s) {
    case "in_progress":
      return 0;
    case "review":
      return 1;
    case "todo":
      return 2;
    case "blocked":
      return 3;
    case "done":
      return 4;
    default:
      return 5;
  }
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
