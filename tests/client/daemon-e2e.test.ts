import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { HubService } from "../../src/hub/service.js";
import { createMcpServer } from "../../src/server.js";
import { startHubHttpServer, type HubHttpHandle } from "../../src/hub/http-server.js";
import { loadConfig } from "../../src/config.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("client daemon stdio ↔ hub HTTP (M3 e2e)", () => {
  let tmpDir: string;
  let hub: HubService;
  let handle: HubHttpHandle;
  let client: Client;
  let transport: StdioClientTransport;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-e2e-"));
    const hubDir = path.join(tmpDir, "hub");
    const clientDir = path.join(tmpDir, "client");
    fs.mkdirSync(hubDir, { recursive: true });
    fs.mkdirSync(clientDir, { recursive: true });

    hub = new HubService({
      dbPath: path.join(hubDir, "hub.db"),
      attachmentsDir: path.join(hubDir, "attachments"),
    });
    hub.projects.upsert({ project_id: "e2e", status: "active", priority: "high" });
    hub.tickets.create({
      project_id: "e2e",
      task_id: "via-daemon",
      summary: "verified via daemon",
      priority: "high",
    });

    const serverFactory = () => createMcpServer({ config: loadConfig(), hub, mode: "hub" });
    handle = await startHubHttpServer({ serverFactory, port: 0, host: "127.0.0.1" });

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(repoRoot, "dist", "cli.js"), "client", "stdio"],
      cwd: repoRoot,
      env: {
        ...process.env,
        RTV_HUB_URL: handle.url,
        RTV_CLIENT_DIR: clientDir,
      } as Record<string, string>,
      stderr: "pipe",
    });
    client = new Client(
      { name: "rtv-e2e-test", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(transport);
  });

  afterEach(async () => {
    try {
      await client?.close();
    } catch {
      /* ignore */
    }
    try {
      await transport?.close();
    } catch {
      /* ignore */
    }
    await handle?.close();
    hub.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("merges hub tools and local tools in tools/list", async () => {
    const r = await client.listTools();
    const names = r.tools.map((t) => t.name);
    // Hub tools forwarded
    expect(names).toContain("rtv_list_projects");
    expect(names).toContain("rtv_list_tickets");
    expect(names).toContain("rtv_create_ticket");
    // Local-only tools
    expect(names).toContain("rtv_local_status");
    expect(names).toContain("rtv_local_push_now");
    expect(names).toContain("rtv_local_recent_files");
  });

  it("forwards rtv_list_tickets call through proxy to hub", async () => {
    const r = await client.callTool({
      name: "rtv_list_tickets",
      arguments: { project_id: "e2e" },
    });
    const text = (r.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join("\n");
    expect(text).toContain("e2e/via-daemon");
    expect(text).toContain("verified via daemon");
  });

  it("local rtv_local_status reports connected hub", async () => {
    const r = await client.callTool({ name: "rtv_local_status", arguments: {} });
    const text = (r.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join("\n");
    expect(text).toContain("hub:");
    expect(text).toContain("connected");
    expect(text).toContain("queue:");
  });
});
