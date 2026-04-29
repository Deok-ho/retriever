import * as http from "node:http";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HubService } from "./service.js";

export interface HubHttpOptions {
  /**
   * Factory called per HTTP request. Stateless Streamable HTTP requires a
   * fresh transport AND a fresh McpServer per request — shared state must
   * live in closures (hub, projector, etc.) outside the McpServer instance.
   */
  serverFactory: () => McpServer;
  port: number;
  host?: string;
  token?: string;
  /** Path under which to serve MCP. Default: /mcp */
  basePath?: string;
  /**
   * Optional override for the web UI directory. Defaults to auto-detection:
   *   - $RTV_WEB_DIR env var
   *   - <repo root>/web (when running from compiled dist)
   *   - <cwd>/web
   */
  uiDir?: string;
  /**
   * Optional shared hub instance. If supplied, /api/* JSON routes are mounted
   * (read-only, for the web UI viewer). The hub is NOT closed by this server.
   */
  hub?: HubService;
}

export interface HubHttpHandle {
  port: number;
  host: string;
  url: string;
  close: () => Promise<void>;
}

/**
 * Start a Streamable HTTP MCP server in stateless mode.
 *
 * Each POST gets a fresh transport + McpServer pair (per-request lifecycle).
 * GET/DELETE are rejected with 405 per stateless convention.
 *
 * If `token` is provided, requests must include `Authorization: Bearer <token>`.
 * Loopback host (127.0.0.1) skips auth even when token is set.
 */
export async function startHubHttpServer(opts: HubHttpOptions): Promise<HubHttpHandle> {
  const host = opts.host ?? "127.0.0.1";
  const basePath = opts.basePath ?? "/mcp";
  const uiDir = resolveUiDir(opts.uiDir);

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}:${opts.port}`);

      if (url.pathname === "/healthz") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
        return;
      }

      // Web UI static handler — /ui/* (and /ui or /ui/ → index.html)
      if (url.pathname === "/ui" || url.pathname === "/ui/" || url.pathname.startsWith("/ui/")) {
        await serveUi(req, res, url.pathname, uiDir);
        return;
      }

      // JSON API for the web viewer (read-only). Only mounted when a hub is supplied.
      if (opts.hub && url.pathname.startsWith("/api/")) {
        await serveApi(req, res, url, opts.hub);
        return;
      }

      if (!url.pathname.startsWith(basePath)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }

      // Token check (only enforced when token set AND host is non-loopback)
      if (opts.token && !isLoopback(host)) {
        const auth = req.headers["authorization"];
        if (auth !== `Bearer ${opts.token}`) {
          res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("unauthorized");
          return;
        }
      }

      if (req.method === "GET" || req.method === "DELETE") {
        res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed." },
            id: null,
          })
        );
        return;
      }

      // Per-request transport + server
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const server = opts.serverFactory();
      await server.connect(transport);

      res.on("close", () => {
        transport.close().catch(() => {
          /* ignore */
        });
        server.close().catch(() => {
          /* ignore */
        });
      });

      await transport.handleRequest(req, res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: msg },
            id: null,
          })
        );
      } else {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(opts.port, host, resolve));
  const addr = httpServer.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : opts.port;
  const url = `http://${host}:${actualPort}${basePath}`;
  process.stderr.write(`retriever hub HTTP listening on ${url}\n`);

  return {
    port: actualPort,
    host,
    url,
    async close() {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

// === JSON API for the web viewer (read-only) ==========================

async function serveApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  hub: HubService
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonRes(res, 405, { error: "method_not_allowed" });
  }
  const p = url.pathname;
  const q = url.searchParams;
  try {
    if (p === "/api/sessions") {
      const rows = hub.sessions.list({
        machine_id: q.get("machine_id") ?? undefined,
        harness: (q.get("harness") as never) ?? undefined,
        project_id: q.get("project_id") ?? undefined,
        status: (q.get("status") as never) ?? undefined,
        since: q.get("since") ?? undefined,
        until: q.get("until") ?? undefined,
        limit: numParam(q.get("limit"), 100),
      });
      return jsonRes(res, 200, { sessions: rows });
    }
    if (p === "/api/sessions/search") {
      const query = q.get("q") ?? "";
      if (!query.trim()) return jsonRes(res, 400, { error: "missing q" });
      const hits = hub.sessions.search(query, {
        machine_id: q.get("machine_id") ?? undefined,
        harness: (q.get("harness") as never) ?? undefined,
        project_id: q.get("project_id") ?? undefined,
        limit: numParam(q.get("limit"), 50),
      });
      return jsonRes(res, 200, { query, hits });
    }
    if (p === "/api/sessions/files") {
      const file_path = q.get("file_path") ?? "";
      if (!file_path) return jsonRes(res, 400, { error: "missing file_path" });
      const rows = hub.sessions.filesTouched(file_path, {
        project_id: q.get("project_id") ?? undefined,
        limit: numParam(q.get("limit"), 50),
      });
      return jsonRes(res, 200, { file_path, sessions: rows });
    }
    const m = p.match(/^\/api\/sessions\/([^/]+)$/);
    if (m) {
      const session_uid = decodeURIComponent(m[1]);
      const r = hub.sessions.read(session_uid, {
        include_transcript: q.get("transcript") === "1" || q.get("transcript") === "true",
        include_events: q.get("events") !== "0" && q.get("events") !== "false",
      });
      if (!r) return jsonRes(res, 404, { error: "not_found" });
      return jsonRes(res, 200, r);
    }
    return jsonRes(res, 404, { error: "not_found" });
  } catch (err) {
    return jsonRes(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function jsonRes(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data, "utf8"),
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function numParam(raw: string | null, def: number): number | undefined {
  if (raw === null) return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

// === Web UI static serving ============================================

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".jsx":  "application/javascript; charset=utf-8", // Babel standalone reads as text
  ".mjs":  "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt":  "text/plain; charset=utf-8",
  ".map":  "application/json; charset=utf-8",
};

function resolveUiDir(override?: string): string | null {
  if (override) return path.resolve(override);
  const env = process.env.RTV_WEB_DIR;
  if (env) return path.resolve(env);

  // Compiled JS sits at <root>/dist/hub/http-server.js. Repo root has web/.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", "..", "web"),       // dist/hub/.. → repo root
    path.resolve(here, "..", "..", "..", "web"), // for vitest runs from src/
    path.resolve(process.cwd(), "web"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

async function serveUi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  uiDir: string | null
): Promise<void> {
  if (!uiDir) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ui directory not found — set RTV_WEB_DIR or ensure ./web exists");
    return;
  }

  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("method not allowed");
    return;
  }

  // Strip /ui prefix → relative path
  let rel = pathname.replace(/^\/ui\/?/, "") || "index.html";
  // Default to index.html for trailing slash or empty
  if (rel === "" || rel.endsWith("/")) rel += "index.html";

  // Resolve and verify the result stays under uiDir (path traversal guard)
  const target = path.resolve(uiDir, rel);
  const relCheck = path.relative(uiDir, target);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return;
  }

  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }

  if (stat.isDirectory()) {
    // Redirect /ui/foo → /ui/foo/index.html
    const indexTarget = path.join(target, "index.html");
    try {
      const idxStat = await fs.stat(indexTarget);
      if (idxStat.isFile()) {
        const buf = await fs.readFile(indexTarget);
        res.writeHead(200, {
          "Content-Type": MIME[".html"],
          "Content-Length": buf.byteLength,
        });
        res.end(req.method === "HEAD" ? undefined : buf);
        return;
      }
    } catch {
      /* fall through */
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }

  const ext = path.extname(target).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const buf = await fs.readFile(target);
  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": buf.byteLength,
    // No-cache during dev — easy iteration. Tighten with hashed filenames later.
    "Cache-Control": "no-cache",
  });
  res.end(req.method === "HEAD" ? undefined : buf);
}
