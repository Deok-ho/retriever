import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { LocalQueue } from "./queue.js";
import { HubClientProxy } from "./proxy.js";
import { buildLocalTools, type LocalToolDef } from "./local-tools.js";

const DEFAULT_HUB_URL = "http://127.0.0.1:8731/mcp";
const FLUSH_INTERVAL_MS = 30_000;

export interface ClientDaemonConfig {
  hubUrl: string;
  token?: string;
}

function loadClientConfig(): ClientDaemonConfig {
  return {
    hubUrl: process.env.RTV_HUB_URL ?? DEFAULT_HUB_URL,
    token: process.env.RTV_HUB_TOKEN,
  };
}

interface DaemonState {
  queue: LocalQueue;
  proxy: HubClientProxy;
  localTools: LocalToolDef[];
  hubUrl: string;
}

function initDaemonState(): DaemonState {
  const config = loadClientConfig();
  const queue = new LocalQueue();
  const proxy = new HubClientProxy(
    { hubUrl: config.hubUrl, token: config.token },
    queue
  );
  const localTools = buildLocalTools({ queue, proxy, hubUrl: config.hubUrl });
  return { queue, proxy, localTools, hubUrl: config.hubUrl };
}

/**
 * Run the client daemon over stdio MCP. Forwards tool calls to the hub via
 * Streamable HTTP, with offline cache/queue. Local-only tools (`rtv_local_*`)
 * are handled in-process.
 */
export async function runClientDaemonStdio(): Promise<void> {
  const state = initDaemonState();
  const localByName = new Map(state.localTools.map((t) => [t.name, t] as const));

  const server = new Server(
    { name: "retriever-client", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const hub = await state.proxy.listHubTools();
    const local = state.localTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return { tools: [...hub.tools, ...local] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    const local = localByName.get(name);
    if (local) {
      const r = await local.handler(args);
      return { content: r.content, isError: r.isError };
    }

    const r = await state.proxy.callTool(name, args);
    return { content: r.content, isError: r.isError };
  });

  // Background flush timer — best effort, no error if hub down
  const flushTimer = setInterval(() => {
    void state.proxy.flushQueue().catch(() => {
      /* ignore */
    });
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();

  const shutdown = async () => {
    clearInterval(flushTimer);
    try {
      await state.proxy.close();
    } catch {
      /* ignore */
    }
    state.queue.close();
  };
  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>((resolve) => {
    transport.onclose = () => {
      void shutdown();
      resolve();
    };
  });
}

export async function showClientStatus(): Promise<void> {
  const state = initDaemonState();
  try {
    const ok = await state.proxy.ensureConnected();
    const queueCount = state.queue.count();
    const queueSample = state.queue.list(10);
    const lines = [
      `hub:    ${ok ? "connected" : "disconnected"} (${state.hubUrl})`,
      `cache:  ${state.proxy.cache.size()} entries`,
      `queue:  ${queueCount} pending`,
    ];
    if (queueSample.length > 0) {
      lines.push("");
      lines.push("queued ops:");
      for (const q of queueSample) {
        lines.push(
          `  #${q.id}  ${q.tool_name}  ts=${q.ts}${q.last_error ? `  err=${q.last_error.slice(0, 80)}` : ""}`
        );
      }
    }
    process.stdout.write(lines.join("\n") + "\n");
  } finally {
    await state.proxy.close();
    state.queue.close();
  }
}

export async function pushNow(): Promise<number> {
  const state = initDaemonState();
  try {
    const r = await state.proxy.flushQueue();
    process.stdout.write(
      `pushed=${r.pushed} remaining=${r.remaining} failed=${r.failed}\n`
    );
    return r.failed > 0 && r.pushed === 0 ? 1 : 0;
  } finally {
    await state.proxy.close();
    state.queue.close();
  }
}
