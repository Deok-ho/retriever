import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";
import type { HubService } from "../hub/service.js";
import { parseClaudeCodeJsonl } from "./parse-claude-code.js";
import { parseCodexJsonl } from "./parse-codex.js";
import type { Harness, ParseResult } from "./types.js";

const HOOK_HEADER = "# Created by `retriever git-hook install`. Edits will be overwritten.";

export interface ResolveMachineIdOptions {
  env?: NodeJS.ProcessEnv;
  fallback?: string;
}

export function resolveMachineId(opts: ResolveMachineIdOptions = {}): string {
  const env = opts.env ?? process.env;
  const raw = (env.RTV_MACHINE_ID ?? opts.fallback ?? os.hostname() ?? "unknown")
    .trim()
    .toLowerCase();
  return raw || "unknown";
}

export interface CaptureOptions {
  hub: HubService;
  machineId: string;
  claudeProjectsDir: string;
  codexSessionsDir: string;
  stateFile: string;
  commitSha?: string | null;
}

export interface CaptureResult {
  scanned: number;
  mirrored: number;
  skipped: number;
  errors: Array<{ file: string; error: string }>;
}

interface CaptureState {
  last_captured_at?: string;
  /** session_uid -> content_hash recorded last successful mirror */
  hashes?: Record<string, string>;
}

async function loadState(stateFile: string): Promise<CaptureState> {
  try {
    const raw = await fsp.readFile(stateFile, "utf8");
    return JSON.parse(raw) as CaptureState;
  } catch {
    return {};
  }
}

async function saveState(stateFile: string, state: CaptureState): Promise<void> {
  await fsp.mkdir(path.dirname(stateFile), { recursive: true });
  const tmp = stateFile + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fsp.rename(tmp, stateFile);
}

interface DiscoveredFile {
  path: string;
  harness: Harness;
  nativeId: string;
}

async function walkClaudeProjects(root: string): Promise<DiscoveredFile[]> {
  const out: DiscoveredFile[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = path.join(root, e.name);
    const files = await fsp.readdir(sub).catch(() => []);
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      out.push({
        path: path.join(sub, f),
        harness: "claude_code",
        nativeId: f.replace(/\.jsonl$/, ""),
      });
    }
  }
  return out;
}

async function walkCodexSessions(root: string): Promise<DiscoveredFile[]> {
  const out: DiscoveredFile[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p);
      } else if (e.isFile() && e.name.endsWith(".jsonl")) {
        out.push({
          path: p,
          harness: "codex",
          nativeId: e.name.replace(/\.jsonl$/, ""),
        });
      }
    }
  }
  await walk(root);
  return out;
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function parseFor(file: DiscoveredFile, content: string): ParseResult {
  if (file.harness === "claude_code") {
    return parseClaudeCodeJsonl(content);
  }
  return parseCodexJsonl(content, { fallbackNativeId: file.nativeId });
}

export async function captureSessions(opts: CaptureOptions): Promise<CaptureResult> {
  const result: CaptureResult = { scanned: 0, mirrored: 0, skipped: 0, errors: [] };
  const state = await loadState(opts.stateFile);
  const hashes = state.hashes ?? {};

  const files = [
    ...(await walkClaudeProjects(opts.claudeProjectsDir)),
    ...(await walkCodexSessions(opts.codexSessionsDir)),
  ];

  for (const file of files) {
    result.scanned += 1;
    let content: string;
    try {
      content = await fsp.readFile(file.path, "utf8");
    } catch (err) {
      result.errors.push({ file: file.path, error: String(err) });
      continue;
    }
    const hash = sha256(content);
    let parsed: ParseResult;
    try {
      parsed = parseFor(file, content);
    } catch (err) {
      result.errors.push({ file: file.path, error: String(err) });
      continue;
    }
    if (!parsed.started_at || !parsed.last_active_at) {
      // No timestamped events — skip silently
      result.skipped += 1;
      continue;
    }
    const native_id =
      typeof parsed.meta.native_id === "string"
        ? parsed.meta.native_id
        : file.nativeId;
    const session_uid = `${opts.machineId}:${file.harness}:${native_id}`;

    if (hashes[session_uid] === hash && !opts.commitSha) {
      result.skipped += 1;
      continue;
    }

    try {
      opts.hub.sessions.mirror({
        machine_id: opts.machineId,
        harness: file.harness,
        native_id,
        cwd_at_start: parsed.cwd_at_start,
        started_at: parsed.started_at,
        last_active_at: parsed.last_active_at,
        transcript_content: content,
        content_hash: hash,
        events: parsed.events,
        commit_sha: opts.commitSha ?? null,
      });
      hashes[session_uid] = hash;
      result.mirrored += 1;
    } catch (err) {
      result.errors.push({ file: file.path, error: String(err) });
    }
  }

  await saveState(opts.stateFile, {
    last_captured_at: new Date().toISOString(),
    hashes,
  });

  return result;
}

// === git hook ===

const HOOK_BODY = `#!/bin/sh
${HOOK_HEADER}
# Background-detached so the commit isn't blocked by capture work.
( retriever client capture-sessions \\
    --commit-sha "$(git rev-parse HEAD)" \\
    >> "$(git rev-parse --git-dir)/retriever-capture.log" 2>&1 & ) </dev/null
`;

export interface InstallHookOptions {
  repoPath: string;
}

export interface InstallHookResult {
  installed: boolean;
  alreadyManaged: boolean;
  hookPath: string;
}

export function installGitHook(opts: InstallHookOptions): InstallHookResult {
  const hookPath = path.join(opts.repoPath, ".git", "hooks", "post-commit");
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf8");
    if (!existing.includes(HOOK_HEADER)) {
      throw new Error(
        `foreign post-commit hook already exists at ${hookPath}. Refusing to overwrite. Move/merge it manually then re-run.`
      );
    }
    fs.writeFileSync(hookPath, HOOK_BODY, { mode: 0o755 });
    return { installed: true, alreadyManaged: true, hookPath };
  }
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, HOOK_BODY, { mode: 0o755 });
  return { installed: true, alreadyManaged: false, hookPath };
}

export interface UninstallHookResult {
  removed: boolean;
  hookPath: string;
}

export function uninstallGitHook(opts: InstallHookOptions): UninstallHookResult {
  const hookPath = path.join(opts.repoPath, ".git", "hooks", "post-commit");
  if (!fs.existsSync(hookPath)) {
    return { removed: false, hookPath };
  }
  const existing = fs.readFileSync(hookPath, "utf8");
  if (!existing.includes(HOOK_HEADER)) {
    return { removed: false, hookPath };
  }
  fs.unlinkSync(hookPath);
  return { removed: true, hookPath };
}

export function defaultClaudeProjectsDir(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

export function defaultCodexSessionsDir(): string {
  return path.join(os.homedir(), ".codex", "sessions");
}

export function defaultCaptureStateFile(): string {
  return path.join(os.homedir(), ".rtv-client", "capture-state.json");
}
