import * as http from "node:http";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HubService } from "./service.js";
import { logger, generateRequestId } from "../utils/logger.js";

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
  const requireAuth = !isLoopback(host);

  // Hard-fail at startup if exposed beyond loopback without a token.
  // (Codex iter5 review #1 — auth bypass was a blocker for commercial-grade.)
  if (requireAuth && !opts.token) {
    throw new Error(
      `Refusing to start hub HTTP on non-loopback host ${host} without RTV_HUB_TOKEN. ` +
        `Set RTV_HUB_TOKEN to a strong secret, or bind to 127.0.0.1 / ::1 / localhost.`
    );
  }

  // (Codex iter7 #6) — Cookie bootstrap. ?token= only arrives on the initial
  // HTML request; static <script src=…> and fetch() never propagate query
  // params or Authorization automatically. We exchange a matching ?token= or
  // Bearer header for an HttpOnly session cookie so all subsequent asset/API
  // requests authenticate without manual token plumbing.
  const COOKIE_NAME = "rtv_hub_session";

  const cookieValue = (req: http.IncomingMessage, name: string): string | null => {
    const raw = req.headers["cookie"];
    if (typeof raw !== "string") return null;
    for (const part of raw.split(";")) {
      const [k, v] = part.trim().split("=");
      if (k === name && typeof v === "string") return decodeURIComponent(v);
    }
    return null;
  };

  const tokenFromQuery = (req: http.IncomingMessage): string | null => {
    try {
      const u = new URL(req.url ?? "/", `http://${host}:${opts.port}`);
      const q = u.searchParams.get("token");
      return typeof q === "string" ? q : null;
    } catch {
      return null;
    }
  };

  const tokenFromBearer = (req: http.IncomingMessage): string | null => {
    const h = req.headers["authorization"];
    if (typeof h !== "string") return null;
    return h.startsWith("Bearer ") ? h.slice(7) : null;
  };

  const isAuthorized = (req: http.IncomingMessage): boolean => {
    if (!requireAuth) return true; // loopback: trust the host
    if (tokenFromBearer(req) === opts.token) return true;
    if (tokenFromQuery(req) === opts.token) return true;
    if (cookieValue(req, COOKIE_NAME) === opts.token) return true;
    return false;
  };

  /** Returns Set-Cookie header value if the inbound request supplied a fresh
   *  `?token=…` (matched) or Bearer header AND no cookie was attached yet. */
  const maybeIssueCookie = (req: http.IncomingMessage): string | null => {
    if (!requireAuth || !opts.token) return null;
    if (cookieValue(req, COOKIE_NAME) === opts.token) return null; // already set
    const fresh = tokenFromQuery(req) === opts.token || tokenFromBearer(req) === opts.token;
    if (!fresh) return null;
    const attrs = [
      `${COOKIE_NAME}=${encodeURIComponent(opts.token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=43200", // 12h
    ];
    return attrs.join("; ");
  };

  const httpServer = http.createServer(async (req, res) => {
    // (Codex 주의급 #7) Per-request id + structured access logging.
    const startedAt = Date.now();
    const incomingReqId = req.headers["x-request-id"];
    const reqId =
      typeof incomingReqId === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(incomingReqId)
        ? incomingReqId
        : generateRequestId();
    res.setHeader("X-Request-Id", reqId);
    res.on("finish", () => {
      const dur = Date.now() - startedAt;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger[level]("hub_http_access", {
        req_id: reqId,
        method: req.method,
        path: req.url?.split("?")[0],
        status: res.statusCode,
        dur_ms: dur,
      });
    });

    try {
      const url = new URL(req.url ?? "/", `http://${host}:${opts.port}`);

      // Single global auth gate — applied to every path except /healthz.
      // /healthz must remain unauthenticated for orchestrators (Docker, Tailscale,
      // load balancers) — it returns no session data.
      if (url.pathname !== "/healthz" && !isAuthorized(req)) {
        res.writeHead(401, {
          "Content-Type": "text/plain; charset=utf-8",
          "WWW-Authenticate": "Bearer realm=\"retriever-hub\"",
        });
        res.end("unauthorized");
        return;
      }

      // After auth passes, mint a session cookie if this request bootstrapped
      // via ?token= or Bearer. Subsequent asset/API requests use the cookie.
      const setCookie = maybeIssueCookie(req);
      if (setCookie) {
        // Wrap writeHead so handlers don't need to know about cookie issuance.
        const origWriteHead = res.writeHead.bind(res);
        res.writeHead = ((statusCode: number, headersOrReason?: unknown, maybeHeaders?: unknown) => {
          let headers: http.OutgoingHttpHeaders | undefined;
          let reason: string | undefined;
          if (typeof headersOrReason === "string") {
            reason = headersOrReason;
            headers = maybeHeaders as http.OutgoingHttpHeaders | undefined;
          } else {
            headers = headersOrReason as http.OutgoingHttpHeaders | undefined;
          }
          const merged: http.OutgoingHttpHeaders = { ...(headers ?? {}) };
          // Don't overwrite if a handler already set Set-Cookie.
          if (!merged["Set-Cookie"] && !merged["set-cookie"]) {
            merged["Set-Cookie"] = setCookie;
          }
          return reason
            ? origWriteHead(statusCode, reason, merged)
            : origWriteHead(statusCode, merged);
        }) as typeof res.writeHead;
      }

      if (url.pathname === "/healthz") {
        // (Codex 주의급 #12) DB ping. Verifies SQLite is actually queryable —
        // hub.db corruption / volume unmount would still pass a HTTP-only
        // healthcheck. SELECT 1 is ~µs; we cap latency at 1s in the response.
        let dbReady = true;
        let dbLatencyMs = 0;
        let dbError: string | undefined;
        if (opts.hub) {
          const t0 = Date.now();
          try {
            opts.hub.db.prepare("SELECT 1").get();
          } catch (e) {
            dbReady = false;
            dbError = e instanceof Error ? e.message : String(e);
          }
          dbLatencyMs = Date.now() - t0;
        }
        const overallOk = dbReady;
        res.writeHead(overallOk ? 200 : 503, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({
            ok: overallOk,
            ts: new Date().toISOString(),
            db: { ready: dbReady, latency_ms: dbLatencyMs, error: dbError },
            host,
          })
        );
        return;
      }

      // If the request arrived via ?token= on the UI HTML, redirect once to
      // strip the secret from the URL bar (cookie now carries auth).
      if (
        setCookie &&
        tokenFromQuery(req) === opts.token &&
        (url.pathname === "/ui" ||
          url.pathname === "/ui/" ||
          url.pathname === "/ui/index.html")
      ) {
        url.searchParams.delete("token");
        const cleanPath = url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "");
        res.writeHead(302, {
          Location: cleanPath,
          "Set-Cookie": setCookie,
        });
        res.end();
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
      logger.error("hub_http_unhandled", {
        req_id: reqId,
        path: req.url?.split("?")[0],
        err,
      });
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
  logger.info("hub_http_listen", { host, port: actualPort, base_path: basePath, requires_auth: requireAuth });
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
    if (p === "/api/sessions/daily") {
      const since = q.get("since");
      const until = q.get("until");
      if (!since || !until) {
        return jsonRes(res, 400, { error: "missing since/until" });
      }
      const rows = hub.sessions.dailyDigest({
        since,
        until,
        machine_id: q.get("machine_id") ?? undefined,
        harness: (q.get("harness") as never) ?? undefined,
        limit: numParam(q.get("limit"), 100),
      });
      return jsonRes(res, 200, { since, until, sessions: rows });
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
      const after = q.get("events_after_seq");
      const lim = q.get("events_limit");
      const r = hub.sessions.read(session_uid, {
        include_transcript: q.get("transcript") === "1" || q.get("transcript") === "true",
        include_events: q.get("events") !== "0" && q.get("events") !== "false",
        events_after_seq:
          after !== null && /^-?\d+$/.test(after) ? Number(after) : undefined,
        events_limit:
          lim !== null && /^\d+$/.test(lim) ? Number(lim) : undefined,
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
