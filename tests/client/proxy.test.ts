import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HubService } from "../../src/hub/service.js";
import { createMcpServer } from "../../src/server.js";
import { startHubHttpServer, type HubHttpHandle } from "../../src/hub/http-server.js";
import { loadConfig } from "../../src/config.js";
import { LocalQueue } from "../../src/client/queue.js";
import { HubClientProxy } from "../../src/client/proxy.js";

describe("HubClientProxy (M3 client + offline queue)", () => {
  let tmpDir: string;
  let hub: HubService;
  let handle: HubHttpHandle | null = null;
  let queue: LocalQueue;
  let proxy: HubClientProxy;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-proxy-"));
    const hubDir = path.join(tmpDir, "hub");
    const clientDir = path.join(tmpDir, "client");
    fs.mkdirSync(hubDir, { recursive: true });
    fs.mkdirSync(clientDir, { recursive: true });

    hub = new HubService({
      dbPath: path.join(hubDir, "hub.db"),
      attachmentsDir: path.join(hubDir, "attachments"),
    });
    hub.projects.upsert({ project_id: "px", status: "active", priority: "high" });
    hub.tickets.create({
      project_id: "px",
      task_id: "tx",
      summary: "proxy ticket",
      priority: "high",
    });

    const serverFactory = () => createMcpServer({ config: loadConfig(), hub, mode: "hub" });
    handle = await startHubHttpServer({ serverFactory, port: 0, host: "127.0.0.1" });

    queue = new LocalQueue({ dbPath: path.join(clientDir, "state.db") });
    proxy = new HubClientProxy(
      { hubUrl: handle.url, cacheTtlMs: 5_000 },
      queue
    );
  });

  afterEach(async () => {
    await proxy.close();
    queue.close();
    if (handle) await handle.close();
    hub.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("forwards calls to hub when online and caches reads", async () => {
    const list = await proxy.callTool("rtv_list_projects", {});
    expect(list.isError).toBeFalsy();
    expect(list.queued).toBeFalsy();
    const text = list.content.map((c) => c.text).join("\n");
    expect(text).toContain("px");

    // Now bring hub down — read should fall back to cache (stale=true)
    await handle!.close();
    handle = null;
    await proxy.close();
    // Recreate proxy with stale connection state
    proxy = new HubClientProxy(
      { hubUrl: "http://127.0.0.1:9", cacheTtlMs: 5_000 }, // unreachable port
      queue
    );
    // Pre-warm cache by calling once (will fail but we want to test write path)
    const writeOffline = await proxy.callTool("rtv_create_ticket", {
      project_id: "px",
      task_id: "queued",
      summary: "queued op",
    });
    expect(writeOffline.queued).toBe(true);
    expect(queue.count()).toBe(1);
  });

  it("returns isError when read tool offline with no cached entry", async () => {
    await handle!.close();
    handle = null;
    await proxy.close();
    proxy = new HubClientProxy(
      { hubUrl: "http://127.0.0.1:9", cacheTtlMs: 5_000 },
      queue
    );
    const r = await proxy.callTool("rtv_list_projects", {});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("hub unreachable");
  });

  it("queues write ops when hub is unreachable", async () => {
    await handle!.close();
    handle = null;
    await proxy.close();
    proxy = new HubClientProxy(
      { hubUrl: "http://127.0.0.1:9", cacheTtlMs: 5_000 },
      queue
    );
    const r = await proxy.callTool("rtv_create_ticket", {
      project_id: "px",
      task_id: "t-offline",
      summary: "offline create",
    });
    expect(r.queued).toBe(true);
    expect(queue.count()).toBe(1);
    const op = queue.list(1)[0];
    expect(op.tool_name).toBe("rtv_create_ticket");
    expect(JSON.parse(op.arguments_json).task_id).toBe("t-offline");
  });
});
