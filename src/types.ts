// === Personas ===
export interface Persona {
  git_user: string;
  git_email: string;
}

export interface PersonasFile {
  personas: Record<string, Persona>;
}

// === Global Settings ===
export interface GlobalSettings {
  default_persona: string;
  env: Record<string, EnvDeclaration>;
}

export interface EnvDeclaration {
  source: "keyring" | "env" | "file";
  required: boolean;
}

// === Project Manifest ===
export interface Manifest {
  project: {
    name: string;
    description: string;
    created: string;
  };
  persona: string;
  env?: Record<string, EnvDeclaration>;
  harness: Record<string, HarnessConfig>;
  sync: {
    sessions: boolean;
    conversations: boolean;
    tasks: boolean;
    plans: boolean;
  };
}

export interface HarnessConfig {
  rules?: string;
  memory?: string;
  skills?: string;
  instructions?: string;
}

// === Snapshot ===
export interface Snapshot {
  repo: RepoState;
  harness: Record<string, HarnessSnapshot>;
  env: Record<string, "set" | "missing">;
  persona: {
    current: string;
    desired: string;
    match: boolean;
  };
  collected_at: string;
  device: string;
}

export interface RepoState {
  path: string;
  branch: string;
  last_commit: string;
  dirty: boolean;
  uncommitted_files: number;
  remote: string;
  remote_sync: string;
}

export interface HarnessSnapshot {
  rules_hash?: string;
  rules_count?: number;
  memory_count?: number;
  instructions_hash?: string;
  active_sessions?: number;
}

// === Diff ===
export type DiffStatus = "match" | "mismatch" | "missing" | "extra";

export interface DiffItem {
  scope: string;
  status: DiffStatus;
  desired?: string;
  actual?: string;
  message: string;
}

export interface DiffReport {
  project: string;
  device: string;
  collected_at: string;
  items: DiffItem[];
  summary: { match: number; mismatch: number; missing: number };
}

// === Memory ===
export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryEntry {
  name: string;
  description: string;
  type: MemoryType;
  body: string;
  filePath?: string;
  source?: "global" | "project";
}

// === Adapter ===
export interface ToolAdapter {
  name: string;
  detect(projectPath?: string): Promise<boolean>;
  collectHarness(projectPath: string): Promise<HarnessSnapshot>;
  applyRules(desiredRulesDir: string, projectPath: string): Promise<void>;
  applyPersona(persona: Persona): Promise<void>;
  supportsNativeMemory(): boolean;
}

// === Config ===
export interface RtvConfig {
  storePath: string;
  deviceName: string;
  gemma4?: Gemma4Config;
}

// === Gemma4 Adapter ===
export interface Gemma4Config {
  enabled: boolean;
  url: string;
  model: string;
  timeoutMs: number;
}

export type Gemma4Result<T> =
  | { ok: true; data: T; raw: string }
  | { ok: false; error: string };

export type TaskType = "구현" | "리서치" | "문서" | "리뷰";
export type Priority = "high" | "med" | "low";

export interface ClassifyTicketInput {
  request: string;
  projectHint?: string;
}
export interface ClassifyTicketOutput {
  task_type: TaskType;
  priority: Priority;
  completion_criteria: string[];
  summary: string;
}

export interface VerifyCompletionInput {
  ticketBody: string;
  completionCriteria: string[];
  recentActivity?: string;
}
export interface VerifyCompletionOutput {
  completed: boolean;
  missing: string[];
  rationale: string;
}

export interface DiagnoseStalledInput {
  ticketBody: string;
  stalledSince: string;
  recentActivity?: string;
}
export interface DiagnoseStalledOutput {
  reason: "blocked" | "deprioritized" | "abandoned";
  rationale: string;
}

export interface DuplicateCandidate {
  task_id: string;
  summary: string;
}
export interface FindDuplicatesInput {
  draftSummary: string;
  candidates: DuplicateCandidate[];
}
export interface FindDuplicatesOutput {
  matches: { task_id: string; similarity: number; reason: string }[];
}

export interface AttachmentInput {
  type: string;
  path: string;
  content: string;
}
export interface SummarizeAttachmentsInput {
  taskSummary: string;
  attachments: AttachmentInput[];
}
export interface SummarizeAttachmentsOutput {
  summary: string;
}

export interface BoardNarrativeInput {
  weekRange: { start: string; end: string };
  statusTransitions: string[];
  stalledTickets: string[];
  completedTickets: string[];
}
export interface BoardNarrativeOutput {
  narrative: string;
}
