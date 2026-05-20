#!/usr/bin/env node
/**
 * Retriever CLI — single binary entrypoint with subcommands.
 *
 * Default (no args): stdio MCP server — backward compat with existing
 * Claude Code / Codex configs that point `retriever` at stdio transport.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HubService } from "./hub/service.js";
import { createMcpServer } from "./server.js";
import { loadProjectorFromEnv, VaultProjector } from "./projection/writer.js";

const HELP = `Retriever — cross-LLM context hub

Usage:
  retriever                            stdio MCP server (default)
  retriever stdio                      explicit stdio MCP server
  retriever hub start [--http] [--port N] [--host H]
                                       run hub server (stdio default; --http for Streamable HTTP)
  retriever hub seed [path/to/cfg]     load seed config into hub DB
  retriever hub sync [project_id]      project hub data → vault markdown
  retriever hub migrate                run pending DB migrations
  retriever hub backup [--out PATH]    VACUUM INTO snapshot of hub.db
  retriever hub restore <PATH>         replace hub.db with a prior backup
  retriever client stdio               run as MCP client daemon (proxies to hub)
  retriever client status              queue / cache status
  retriever client push-now            flush offline queue to hub
  retriever client capture-sessions [--commit-sha SHA] [--no-redact] [--strict]
                                       scan ~/.claude + ~/.codex jsonls and mirror to hub
  retriever client session-status      capture-state.json snapshot
  retriever git-hook install [--repo PATH]    install post-commit capture hook
  retriever git-hook uninstall [--repo PATH]  remove post-commit capture hook
  retriever --help                     this help
  retriever --version                  version

Environment:
  RTV_HUB_DIR           hub data dir (default: ~/.rtv-hub)
  RTV_VAULT_PATH        vault projection root (e.g. /path/to/Coding)
  RTV_HUB_URL           hub HTTP endpoint for client (default: http://127.0.0.1:8731/mcp)
  RTV_HUB_PORT          hub HTTP port (default: 8731)
  RTV_HUB_HOST          hub HTTP bind host (default: 127.0.0.1; use 0.0.0.0 in containers)
  RTV_WEB_DIR           static web UI directory served at /ui/* (default: <repo>/web)
  RTV_HUB_TOKEN         optional bearer token for hub HTTP auth
  RTV_MACHINE_ID        machine slug used in session_uid (default: hostname)
`;

const VERSION = "0.1.0";

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`retriever ${VERSION}\n`);
    return 0;
  }

  if (args.length === 0 || args[0] === "stdio") {
    return runStdioServer();
  }

  const [group, sub, ...rest] = args;

  if (group === "hub") {
    if (sub === "start") return runHubStart(rest);
    if (sub === "seed") return runHubSeed(rest[0]);
    if (sub === "sync") return runHubSync(rest[0]);
    if (sub === "migrate") return runHubMigrate();
    if (sub === "backup") return runHubBackup(rest);
    if (sub === "restore") return runHubRestore(rest);
    return badUsage(`unknown hub subcommand: ${sub ?? "(none)"}`);
  }

  if (group === "client") {
    if (sub === "stdio") return runClientStdio();
    if (sub === "status") return runClientStatus();
    if (sub === "push-now") return runClientPushNow();
    if (sub === "capture-sessions") return runCaptureSessions(rest);
    if (sub === "session-status") return runSessionStatus();
    return badUsage(`unknown client subcommand: ${sub ?? "(none)"}`);
  }

  if (group === "git-hook") {
    if (sub === "install") return runGitHookInstall(rest);
    if (sub === "uninstall") return runGitHookUninstall(rest);
    return badUsage(`unknown git-hook subcommand: ${sub ?? "(none)"}`);
  }

  return badUsage(`unknown command: ${group}`);
}

function badUsage(msg: string): number {
  process.stderr.write(`error: ${msg}\n\n${HELP}`);
  return 2;
}

// === Subcommands ===

async function runStdioServer(): Promise<number> {
  const config = loadConfig();
  const hub = new HubService();
  const projector = loadProjectorFromEnv(hub);
  const server = createMcpServer({ config, hub, projector, mode: "embedded" });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stay alive until transport closes (stdin EOF or remote disconnect)
  return new Promise<number>((resolve) => {
    transport.onclose = () => {
      try {
        hub.close();
      } catch {
        /* ignore */
      }
      resolve(0);
    };
  });
}

async function runHubStart(args: string[]): Promise<number> {
  const useHttp = args.includes("--http");
  const portIdx = args.indexOf("--port");
  const port = portIdx >= 0 ? Number(args[portIdx + 1]) : Number(process.env.RTV_HUB_PORT ?? 8731);
  const hostIdx = args.indexOf("--host");
  const host = hostIdx >= 0 ? String(args[hostIdx + 1]) : process.env.RTV_HUB_HOST ?? "127.0.0.1";

  if (!useHttp) {
    return runStdioServer();
  }

  const { startHubHttpServer } = await import("./hub/http-server.js");
  const config = loadConfig();
  const hub = new HubService();
  const projector = loadProjectorFromEnv(hub);
  const serverFactory = () => createMcpServer({ config, hub, projector, mode: "hub" });
  const token = process.env.RTV_HUB_TOKEN;

  // startHubHttpServer hard-fails when bound non-loopback without a token —
  // the previous soft warn was insufficient (Codex iter5 #1 blocker fix).
  await startHubHttpServer({ serverFactory, port, host, token, hub });
  return new Promise<number>((resolve) => {
    const shutdown = () => {
      hub.close();
      resolve(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

async function runHubSeed(configPath?: string): Promise<number> {
  if (configPath) process.env.RTV_SEED_CONFIG = configPath;
  // Defer to seed-hub.mjs (already public-safe)
  const { spawnSync } = await import("node:child_process");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const seedScript = path.resolve(here, "..", "scripts", "seed-hub.mjs");
  const r = spawnSync(process.execPath, [seedScript], { stdio: "inherit", env: process.env });
  return r.status ?? 1;
}

async function runHubSync(project_id?: string): Promise<number> {
  const hub = new HubService();
  try {
    const projector = loadProjectorFromEnv(hub);
    if (!projector) {
      process.stderr.write(
        "RTV_VAULT_PATH not set. Set it to vault projection root (e.g. .../개인작업물_Coding)\n"
      );
      return 1;
    }
    const summary = await projector.sync({ project_id, includeDashboard: true });
    process.stdout.write(
      `sync ok — projects=${summary.projects} tickets=${summary.tickets} dashboard=${summary.dashboard ? "yes" : "no"}\n` +
        `vault: ${summary.vaultPath}\n`
    );
    return 0;
  } finally {
    hub.close();
  }
}

async function runHubMigrate(): Promise<number> {
  // Migrations run automatically on HubService construction; this is an explicit alias.
  const hub = new HubService();
  hub.close();
  process.stdout.write("migrations applied.\n");
  return 0;
}

async function runHubBackup(args: string[]): Promise<number> {
  const { backupHubDb } = await import("./hub/backup.js");
  const { loadHubDbConfig } = await import("./db/database.js");
  const path = await import("node:path");

  const cfg = loadHubDbConfig();
  const outIdx = args.indexOf("--out");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target =
    outIdx >= 0 && args[outIdx + 1]
      ? path.resolve(args[outIdx + 1])
      : path.join(path.dirname(cfg.dbPath), "backups", `hub-${stamp}.db`);
  const overwrite = args.includes("--force");

  try {
    const r = backupHubDb({ source: cfg.dbPath, target, overwrite });
    process.stdout.write(`hub backup ok — ${r.target} (${r.bytes} bytes)\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`backup failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

async function runHubRestore(args: string[]): Promise<number> {
  const source = args.find((a) => !a.startsWith("--"));
  if (!source) return badUsage("hub restore <PATH>: missing path");
  const { restoreHubDb } = await import("./hub/backup.js");
  const { loadHubDbConfig } = await import("./db/database.js");
  const path = await import("node:path");
  const cfg = loadHubDbConfig();

  try {
    const r = restoreHubDb({ source: path.resolve(source), target: cfg.dbPath });
    process.stdout.write(
      `hub restore ok — ${r.target} (${r.bytes} bytes)` +
        (r.preservedAs ? `; previous preserved as ${r.preservedAs}` : "") +
        "\n"
    );
    return 0;
  } catch (err) {
    process.stderr.write(`restore failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

async function runClientStdio(): Promise<number> {
  const { runClientDaemonStdio } = await import("./client/daemon.js");
  await runClientDaemonStdio();
  return 0;
}

async function runClientStatus(): Promise<number> {
  const { showClientStatus } = await import("./client/daemon.js");
  await showClientStatus();
  return 0;
}

async function runClientPushNow(): Promise<number> {
  const { pushNow } = await import("./client/daemon.js");
  return pushNow();
}

async function runCaptureSessions(args: string[]): Promise<number> {
  const {
    captureSessions,
    resolveMachineId,
    defaultClaudeProjectsDir,
    defaultCodexSessionsDir,
    defaultCaptureStateFile,
  } = await import("./sessions/capture.js");
  const commitIdx = args.indexOf("--commit-sha");
  const commitSha = commitIdx >= 0 ? args[commitIdx + 1] : null;
  const redact = !args.includes("--no-redact");
  const redactStrict = args.includes("--strict");

  const hub = new HubService();
  try {
    const machineId = resolveMachineId();
    const result = await captureSessions({
      hub,
      machineId,
      claudeProjectsDir: defaultClaudeProjectsDir(),
      codexSessionsDir: defaultCodexSessionsDir(),
      stateFile: defaultCaptureStateFile(),
      commitSha,
      redact,
      redactStrict,
    });
    process.stdout.write(
      `capture-sessions ok — machine=${machineId} scanned=${result.scanned} mirrored=${result.mirrored} skipped=${result.skipped} errors=${result.errors.length}\n`
    );
    if (result.redactions) {
      const byType = Object.entries(result.redactions.byType)
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
      process.stdout.write(
        `  redacted: ${result.redactions.totalMatches} matches in ${result.redactions.filesAffected} files (${byType})\n`
      );
    }
    if (result.errors.length) {
      for (const e of result.errors.slice(0, 10)) {
        process.stderr.write(`  ! ${e.file}: ${e.error}\n`);
      }
    }
    return result.errors.length > 0 ? 1 : 0;
  } finally {
    hub.close();
  }
}

async function runSessionStatus(): Promise<number> {
  const fs = await import("node:fs/promises");
  const { defaultCaptureStateFile, resolveMachineId } = await import("./sessions/capture.js");
  const stateFile = defaultCaptureStateFile();
  let raw: string;
  try {
    raw = await fs.readFile(stateFile, "utf8");
  } catch {
    process.stdout.write(
      `session-status — machine=${resolveMachineId()} state=(none) file=${stateFile}\n`
    );
    return 0;
  }
  const state = JSON.parse(raw) as {
    last_captured_at?: string;
    hashes?: Record<string, string>;
  };
  const known = Object.keys(state.hashes ?? {}).length;
  process.stdout.write(
    `session-status — machine=${resolveMachineId()} last=${state.last_captured_at ?? "(never)"} tracked=${known} file=${stateFile}\n`
  );
  return 0;
}

async function runGitHookInstall(args: string[]): Promise<number> {
  const { installGitHook } = await import("./sessions/capture.js");
  const repoIdx = args.indexOf("--repo");
  const repoPath = repoIdx >= 0 ? args[repoIdx + 1] : process.cwd();
  try {
    const r = installGitHook({ repoPath });
    process.stdout.write(
      `${r.alreadyManaged ? "updated" : "installed"} ${r.hookPath}\n`
    );
    return 0;
  } catch (err) {
    process.stderr.write(
      `git-hook install failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return 1;
  }
}

async function runGitHookUninstall(args: string[]): Promise<number> {
  const { uninstallGitHook } = await import("./sessions/capture.js");
  const repoIdx = args.indexOf("--repo");
  const repoPath = repoIdx >= 0 ? args[repoIdx + 1] : process.cwd();
  const r = uninstallGitHook({ repoPath });
  if (r.removed) {
    process.stdout.write(`removed ${r.hookPath}\n`);
  } else {
    process.stdout.write(
      `nothing to remove (no retriever-managed hook at ${r.hookPath})\n`
    );
  }
  return 0;
}

main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  }
);

// Re-export for direct programmatic use
export { createMcpServer, VaultProjector };
