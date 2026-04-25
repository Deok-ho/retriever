import * as http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}:${opts.port}`);

      if (url.pathname === "/healthz") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
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
