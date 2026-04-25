import type { HubService } from "./service.js";
import type {
  CreateTicketInput,
  ListTicketsFilter,
  UpsertProjectInput,
  TicketStatus,
  Attachment,
  Ticket,
} from "../db/types.js";
import {
  renderPortfolioBoard,
  renderProjectBoard,
} from "../projection/templates.js";

// === Project tools ===

export function listProjects(hub: HubService) {
  const rows = hub.projects.list();
  if (rows.length === 0) return "등록된 프로젝트 없음";
  return rows
    .map(
      (p) =>
        `[${p.health}] ${p.project_id}  status=${p.status} priority=${p.priority} phase=${p.phase ?? "-"}${p.next_task_id ? `  next=${p.next_task_id}` : ""}`
    )
    .join("\n");
}

export function upsertProject(hub: HubService, input: UpsertProjectInput) {
  const row = hub.projects.upsert(input);
  return `upsert ${row.project_id} — status=${row.status} health=${row.health} priority=${row.priority}`;
}

// === Ticket tools ===

export function createTicket(hub: HubService, input: CreateTicketInput) {
  if (!hub.projects.get(input.project_id)) {
    hub.projects.upsert({ project_id: input.project_id });
  }
  const t = hub.tickets.create(input);
  return `created ${t.project_id}/${t.task_id}  status=${t.status} priority=${t.priority} criteria=${t.completion_criteria.length}`;
}

export function listTickets(hub: HubService, filter: ListTicketsFilter) {
  const rows = hub.tickets.list(filter);
  if (rows.length === 0) return "티켓 없음";
  return rows
    .map(
      (t) =>
        `[${t.status}] ${t.project_id}/${t.task_id}  prio=${t.priority}${t.task_type ? ` type=${t.task_type}` : ""}  — ${t.summary}`
    )
    .join("\n");
}

export function readTicket(hub: HubService, project_id: string, task_id: string) {
  const t = hub.tickets.readFull(project_id, task_id);
  if (!t) return `티켓 없음: ${project_id}/${task_id}`;

  const criteriaLines = t.completion_criteria
    .map((c) => `  ${c.done ? "[x]" : "[ ]"} ${c.text}`)
    .join("\n");
  const attachLines = t.attachments
    .map(
      (a: Attachment) =>
        `  📎 ${a.type} ${a.attachment_id} (${a.path ?? a.url ?? ""})`
    )
    .join("\n");
  const refLines = t.context_refs.map((r) => `  → ${r}`).join("\n");

  return [
    `Ticket ${t.project_id}/${t.task_id}`,
    `  status=${t.status}  priority=${t.priority}  task_type=${t.task_type ?? "-"}`,
    `  summary: ${t.summary}`,
    `  est=${t.estimated_hours ?? "-"}h  actual=${t.actual_hours ?? "-"}h`,
    `  created=${t.created_at}  updated=${t.updated_at}`,
    t.completed_at ? `  completed_at=${t.completed_at}` : "",
    t.learnings ? `  learnings: ${t.learnings}` : "",
    "",
    "Completion criteria:",
    criteriaLines || "  (없음)",
    "",
    "Attachments:",
    attachLines || "  (없음)",
    "",
    "Context refs:",
    refLines || "  (없음)",
    "",
    "Body:",
    t.body || "  (빈 본문)",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function updateTicket(
  hub: HubService,
  project_id: string,
  task_id: string,
  patch: {
    status?: TicketStatus;
    priority?: "high" | "med" | "low";
    body?: string;
    actual_hours?: number | null;
    learnings?: string | null;
  }
) {
  const t = hub.tickets.update(project_id, task_id, patch);
  if (!t) return `티켓 없음: ${project_id}/${task_id}`;
  return `updated ${t.project_id}/${t.task_id}  status=${t.status} priority=${t.priority}`;
}

export function completeTicket(
  hub: HubService,
  project_id: string,
  task_id: string,
  learnings: string | null
) {
  const full = hub.tickets.readFull(project_id, task_id);
  if (!full) return `티켓 없음: ${project_id}/${task_id}`;

  const totalC = full.completion_criteria.length;
  const doneC = full.completion_criteria.filter((c) => c.done).length;
  if (totalC > 0 && doneC < totalC) {
    return `완료 불가: criteria ${doneC}/${totalC} 충족`;
  }
  const t = hub.tickets.markCompleted(project_id, task_id, learnings);
  return `completed ${t!.project_id}/${t!.task_id} at ${t!.completed_at}`;
}

// === Attachment tools ===

export async function attach(
  hub: HubService,
  input:
    | {
        project_id: string;
        task_id: string;
        kind: "file";
        source_path: string;
        type: "session" | "diff" | "research" | "transcript";
      }
    | {
        project_id: string;
        task_id: string;
        kind: "url";
        url: string;
        note?: string;
      }
) {
  if (!hub.tickets.read(input.project_id, input.task_id)) {
    return `티켓 없음: ${input.project_id}/${input.task_id}`;
  }

  const att =
    input.kind === "file"
      ? await hub.attachments.attachFile({
          project_id: input.project_id,
          task_id: input.task_id,
          type: input.type,
          source_path: input.source_path,
        })
      : hub.attachments.attachUrl({
          project_id: input.project_id,
          task_id: input.task_id,
          url: input.url,
          note: input.note,
        });

  return `attached ${att.attachment_id}  type=${att.type}  ${att.path ?? att.url}`;
}

export async function detach(hub: HubService, attachment_id: string) {
  const ok = await hub.attachments.detach(attachment_id);
  return ok ? `detached ${attachment_id}` : `첨부 없음: ${attachment_id}`;
}

// === AI tool ===

export async function classifyTicket(
  hub: HubService,
  request: string,
  project_hint?: string
) {
  const r = await hub.gemma4.classifyTicket({ request, projectHint: project_hint });
  if (!r.ok) return `classify 실패: ${r.error}`;

  const lines = [
    "Gemma4 분류 결과:",
    `  task_type: ${r.data.task_type}`,
    `  priority:  ${r.data.priority}`,
    `  summary:   ${r.data.summary}`,
    `  criteria:`,
    ...r.data.completion_criteria.map((c) => `    - ${c}`),
  ];
  return lines.join("\n");
}

// === Board renderer ===
// Gemma4 narrative integration is deferred — current adapter expects weekly
// status transitions which we don't yet aggregate. Board rendering returns
// the structural markdown only.

export async function renderBoard(
  hub: HubService,
  opts: { project_id?: string; narrative?: boolean }
): Promise<string> {
  if (opts.project_id) {
    const project = hub.projects.get(opts.project_id);
    if (!project) return `프로젝트 없음: ${opts.project_id}`;
    const tickets = hub.tickets.list({ project_id: opts.project_id });
    return renderProjectBoard(project, tickets, null);
  }

  const projects = hub.projects.list();
  const ticketsByProject = new Map<string, Ticket[]>();
  for (const p of projects) {
    ticketsByProject.set(p.project_id, hub.tickets.list({ project_id: p.project_id }));
  }
  return renderPortfolioBoard(projects, ticketsByProject, null);
}
