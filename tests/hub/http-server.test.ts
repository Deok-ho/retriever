import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { HubService } from "../../src/hub/service.js";
import { createMcpServer } from "../../src/server.js";
import { startHubHttpServer, type HubHttpHandle } from "../../src/hub/http-server.js";
import { loadConfig } from "../../src/config.js";

describe("Hub HTTP transport (Streamable HTTP)", () => {
  let tmpDir: string;
  let hub: HubService;
  let handle: HubHttpHandle;
  let client: Client;
  let port: number;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-http-"));
    const hubDir = path.join(tmpDir, "hub");
    fs.mkdirSync(hubDir, { recursive: true });
    hub = new HubService({
      dbPath: path.join(hubDir, "hub.db"),
      attachmentsDir: path.join(hubDir, "attachments"),
    });

    hub.projects.upsert({
      project_id: "demo",
      status: "active",
      priority: "high",
    });
    hub.tickets.create({
      project_id: "demo",
      task_id: "t1",
      summary: "demo ticket",
      priority: "high",
    });

    const config = loadConfig();
    const serverFactory = () => createMcpServer({ config, hub, mode: "hub" });

    // Use port 0 → OS-assigned. Then read actual port from the handle.
    handle = await startHubHttpServer({ serverFactory, port: 0, host: "127.0.0.1" });
    port = handle.port;
  });

  afterEach(async () => {
    try {
      await client?.close();
    } catch {
      /* ignore */
    }
    await handle?.close();
    hub.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("listens on assigned port and serves /healthz", async () => {
    const r = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("serves MCP tool list and ticket lookup over Streamable HTTP", async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`)
    );
    client = new Client(
      { name: "rtv-http-test", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(transport);

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain("rtv_list_projects");
    expect(names).toContain("rtv_list_tickets");
    expect(names).toContain("rtv_read_ticket");

    const listResult = await client.callTool({
      name: "rtv_list_tickets",
      arguments: { project_id: "demo" },
    });
    const text = (listResult.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join("\n");
    expect(text).toContain("demo/t1");
    expect(text).toContain("demo ticket");
  });
});
