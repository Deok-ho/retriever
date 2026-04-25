export type ProjectStatus = "active" | "paused" | "done" | "archived";
export type ProjectHealth = "green" | "yellow" | "red";
export type PriorityLevel = "high" | "med" | "low";
export type TicketStatus = "todo" | "in_progress" | "review" | "done" | "blocked";
export type TaskType = "구현" | "리서치" | "문서" | "리뷰";
export type IntakeSource = "manual" | "gemma4" | "mcp" | "import";
export type AttachmentType = "session" | "diff" | "research" | "external" | "transcript";

export interface Project {
  project_id: string;
  status: ProjectStatus;
  health: ProjectHealth;
  priority: PriorityLevel;
  phase: string | null;
  repo_path: string | null;
  harness_project: string | null;
  purpose: string | null;
  goal: string | null;
  context_budget: number;
  next_task_id: string | null;
  stalled_since: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  project_id: string;
  task_id: string;
  status: TicketStatus;
  priority: PriorityLevel;
  task_type: TaskType | null;
  summary: string;
  body: string;
  estimated_hours: number | null;
  actual_hours: number | null;
  intake_source: IntakeSource;
  ai_classified_at: string | null;
  stalled_since: string | null;
  completed_at: string | null;
  learnings: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompletionCriterion {
  idx: number;
  text: string;
  done: boolean;
}

export interface Attachment {
  attachment_id: string;
  project_id: string;
  task_id: string;
  type: AttachmentType;
  path: string | null;
  url: string | null;
  size_bytes: number | null;
  content_hash: string | null;
  summary_hash: string | null;
  added_at: string;
}

export interface TicketFull extends Ticket {
  completion_criteria: CompletionCriterion[];
  attachments: Attachment[];
  context_refs: string[];
}

export interface CreateTicketInput {
  project_id: string;
  task_id: string;
  summary: string;
  status?: TicketStatus;
  priority?: PriorityLevel;
  task_type?: TaskType | null;
  body?: string;
  estimated_hours?: number | null;
  completion_criteria?: string[];
  context_refs?: string[];
  intake_source?: IntakeSource;
}

export interface ListTicketsFilter {
  project_id?: string;
  status?: TicketStatus | TicketStatus[];
  priority?: PriorityLevel;
  limit?: number;
}

export interface UpsertProjectInput {
  project_id: string;
  status?: ProjectStatus;
  health?: ProjectHealth;
  priority?: PriorityLevel;
  phase?: string | null;
  repo_path?: string | null;
  harness_project?: string | null;
  purpose?: string | null;
  goal?: string | null;
  context_budget?: number;
  next_task_id?: string | null;
}
