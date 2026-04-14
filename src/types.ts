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
}
