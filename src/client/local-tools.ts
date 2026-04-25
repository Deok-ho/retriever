import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LocalQueue } from "./queue.js";
import type { HubClientProxy } from "./proxy.js";

const execFileAsync = promisify(execFile);

export interface LocalToolContext {
  queue: LocalQueue;
  proxy: HubClientProxy;
  hubUrl: string;
}

export interface LocalToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

export function buildLocalTools(ctx: LocalToolContext): LocalToolDef[] {
  return [
    {
      name: "rtv_local_status",
      description: "클라이언트 데몬 상태 (큐, 캐시, 허브 연결)",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const ok = await ctx.proxy.ensureConnected();
        const queueCount = ctx.queue.count();
        const queueSample = ctx.queue.list(5);
        const lines = [
          `hub: ${ok ? "connected" : "disconnected"} (${ctx.hubUrl})`,
          `cache size: ${ctx.proxy.cache.size()}`,
          `queue: ${queueCount} pending`,
          ...queueSample.map(
            (q) =>
              `  - #${q.id} ${q.tool_name} ts=${q.ts}${q.last_error ? ` err=${q.last_error.slice(0, 60)}` : ""}`
          ),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      },
    },
    {
      name: "rtv_local_push_now",
      description: "오프라인 큐를 허브에 강제 flush합니다",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const r = await ctx.proxy.flushQueue();
        return {
          content: [
            {
              type: "text",
              text: `pushed=${r.pushed} remaining=${r.remaining} failed=${r.failed}`,
            },
          ],
        };
      },
    },
    {
      name: "rtv_local_recent_files",
      description: "현재 작업 디렉터리에서 최근 수정된 파일 N개 (기본 cwd, 깊이 3, 20개)",
      inputSchema: {
        type: "object",
        properties: {
          dir: { type: "string", description: "탐색 시작 디렉터리 (기본 cwd)" },
          limit: { type: "number", description: "결과 개수 (기본 20)" },
          max_depth: { type: "number", description: "재귀 깊이 (기본 3)" },
        },
      },
      handler: async (args) => {
        const dir = (args.dir as string) ?? process.cwd();
        const limit = (args.limit as number) ?? 20;
        const maxDepth = (args.max_depth as number) ?? 3;
        const files = await listRecentFiles(dir, limit, maxDepth);
        const lines = files.map((f) => `${f.mtime.toISOString()}  ${path.relative(dir, f.path)}`);
        return {
          content: [
            {
              type: "text",
              text: lines.length ? lines.join("\n") : "(no files)",
            },
          ],
        };
      },
    },
    {
      name: "rtv_local_git_diff",
      description: "현재 작업 디렉터리의 git diff (staged + unstaged) 반환",
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string" },
          name_only: { type: "boolean" },
        },
      },
      handler: async (args) => {
        const cwd = (args.cwd as string) ?? process.cwd();
        const nameOnly = (args.name_only as boolean) ?? false;
        const flags = nameOnly ? ["diff", "--name-only", "HEAD"] : ["diff", "HEAD"];
        try {
          const { stdout } = await execFileAsync("git", flags, { cwd, maxBuffer: 4 * 1024 * 1024 });
          return {
            content: [{ type: "text", text: stdout || "(no diff)" }],
          };
        } catch (err) {
          return {
            content: [
              { type: "text", text: `git diff failed: ${err instanceof Error ? err.message : String(err)}` },
            ],
            isError: true,
          };
        }
      },
    },
  ];
}

interface FileEntry {
  path: string;
  mtime: Date;
}

async function listRecentFiles(dir: string, limit: number, maxDepth: number): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  await walk(dir, 0, maxDepth, out);
  out.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return out.slice(0, Math.max(1, limit));
}

async function walk(dir: string, depth: number, maxDepth: number, acc: FileEntry[]): Promise<void> {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, depth + 1, maxDepth, acc);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(full);
        acc.push({ path: full, mtime: stat.mtime });
      } catch {
        /* skip */
      }
    }
  }
}

