import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { LocalQueue } from "./queue.js";
import { LocalCache, stableStringify } from "./cache.js";

export interface ProxyConfig {
  hubUrl: string; // e.g. http://127.0.0.1:8731/mcp
  token?: string;
  /** Tool names treated as read-only (cacheable, fall back to cache when offline). */
  readToolNames?: Set<string>;
  /** TTL for read cache entries. Default: 60s. */
  cacheTtlMs?: number;
}

const DEFAULT_READ_TOOLS = new Set<string>([
  "rtv_list_projects",
  "rtv_list_tickets",
  "rtv_read_ticket",
  "rtv_render_board",
  "rtv_projects",
  "rtv_memory_list",
  "rtv_memory_search",
  "rtv_memory_read",
  "rtv_status",
  "rtv_diff",
]);

export interface ProxyCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  /** True when served from cache because hub was unreachable. */
  stale?: boolean;
  /** True when call was queued for later push because hub was unreachable. */
  queued?: boolean;
}

/**
 * Forwards MCP tool calls to a remote hub over Streamable HTTP, with offline
 * fallback: cache for reads, queue for writes.
 */
export class HubClientProxy {
  readonly cache: LocalCache;
  private readonly readTools: Set<string>;
  private client: Client | null = null;
  private connected = false;
  private connectAttemptedAt = 0;

  constructor(
    private readonly config: ProxyConfig,
    private readonly queue: LocalQueue
  ) {
    this.cache = new LocalCache(config.cacheTtlMs ?? 60_000);
    this.readTools = config.readToolNames ?? DEFAULT_READ_TOOLS;
  }

  async ensureConnected(): Promise<boolean> {
    if (this.connected) return true;
    // Throttle reconnect attempts to once every 3s
    if (Date.now() - this.connectAttemptedAt < 3_000) return false;
    this.connectAttemptedAt = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (this.config.token) headers["Authorization"] = `Bearer ${this.config.token}`;
      const transport = new StreamableHTTPClientTransport(new URL(this.config.hubUrl), {
        requestInit: { headers },
      });
      const client = new Client(
        { name: "retriever-client", version: "0.1.0" },
        { capabilities: {} }
      );
      await client.connect(transport);
      this.client = client;
      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      this.client = null;
      return false;
    }
  }

  async listHubTools(): Promise<{ tools: Array<{ name: string; description?: string; inputSchema: unknown }> }> {
    const ok = await this.ensureConnected();
    if (!ok || !this.client) {
      // Offline: return empty list. Caller must merge with local-only tools.
      return { tools: [] };
    }
    const r = await this.client.listTools();
    return { tools: r.tools as Array<{ name: string; description?: string; inputSchema: unknown }> };
  }

  async callTool(name: string, args: unknown): Promise<ProxyCallResult> {
    const isRead = this.readTools.has(name);
    const cacheKey = `${name}:${stableStringify(args ?? {})}`;

    const ok = await this.ensureConnected();
    if (!ok || !this.client) {
      // Offline path
      if (isRead) {
        const c = this.cache.get(cacheKey);
        if (c.hit) return { ...(c.value as ProxyCallResult), stale: true };
        return {
          content: [{ type: "text", text: `hub unreachable, no cached result for ${name}` }],
          isError: true,
        };
      }
      // Write: queue
      const op = this.queue.enqueue(name, args);
      return {
        content: [
          {
            type: "text",
            text: `queued (id=${op.id}) — hub unreachable. Will push on next sync.`,
          },
        ],
        queued: true,
      };
    }

    // Online: forward
    try {
      const r = await this.client.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> });
      const result: ProxyCallResult = {
        content: (r.content as Array<{ type: "text"; text: string }>) ?? [],
        isError: r.isError as boolean | undefined,
      };
      if (isRead && !result.isError) this.cache.set(cacheKey, result);
      return result;
    } catch (err) {
      // Treat as offline — disconnect and queue/cache fallback
      this.connected = false;
      this.client = null;
      if (isRead) {
        const c = this.cache.get(cacheKey);
        if (c.hit) return { ...(c.value as ProxyCallResult), stale: true };
      } else {
        const op = this.queue.enqueue(name, args);
        return {
          content: [
            {
              type: "text",
              text: `queued (id=${op.id}) — hub call failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          queued: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `hub error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Replays queued ops to the hub in FIFO order. Returns counts.
   * Stops on first connection failure (preserves order).
   */
  async flushQueue(): Promise<{ pushed: number; remaining: number; failed: number }> {
    const ok = await this.ensureConnected();
    if (!ok || !this.client) {
      return { pushed: 0, remaining: this.queue.count(), failed: 0 };
    }

    let pushed = 0;
    let failed = 0;
    while (true) {
      const next = this.queue.list(1)[0];
      if (!next) break;
      try {
        const args = JSON.parse(next.arguments_json);
        const r = await this.client.callTool({ name: next.tool_name, arguments: args });
        if (r.isError) {
          this.queue.recordFailure(next.id, summarize(r.content));
          failed += 1;
          // Don't loop forever on a single bad op — stop after failure
          break;
        }
        this.queue.delete(next.id);
        pushed += 1;
      } catch (err) {
        this.queue.recordFailure(next.id, err instanceof Error ? err.message : String(err));
        failed += 1;
        this.connected = false;
        this.client = null;
        break;
      }
    }
    return { pushed, remaining: this.queue.count(), failed };
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        /* ignore */
      }
    }
    this.client = null;
    this.connected = false;
  }
}

function summarize(content: unknown): string {
  if (!Array.isArray(content)) return "(no content)";
  return content
    .map((c) => (typeof c === "object" && c && "text" in c ? String((c as { text: unknown }).text) : ""))
    .join(" ")
    .slice(0, 200);
}
