import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HubService } from "../../src/hub/service.js";
import { startHubHttpServer, type HubHttpHandle } from "../../src/hub/http-server.js";
import { createMcpServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";

describe("/healthz — DB ping (Codex 주의급 #12)", () => {
  let tmp: string;
  let hub: HubService;
  let handle: HubHttpHandle | null = null;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-healthz-"));
    hub = new HubService({
      dbPath: path.join(tmp, "hub.db"),
      attachmentsDir: path.join(tmp, "attachments"),
    });
  });
  afterEach(async () => {
    if (handle) await handle.close();
    handle = null;
    try { hub.close(); } catch { /* may already be closed */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 200 + ok:true + db.ready:true on a live hub", async () => {
    const config = loadConfig();
    handle = await startHubHttpServer({
      serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
      hub,
      port: 0,
      host: "127.0.0.1",
    });
    const r = await fetch(`http://127.0.0.1:${handle.port}/healthz`);
    expect(r.status).toBe(200);
    const body = await r.json() as {
      ok: boolean;
      ts: string;
      db: { ready: boolean; latency_ms: number; error?: string };
      host: string;
    };
    expect(body.ok).toBe(true);
    expect(body.db.ready).toBe(true);
    expect(body.db.error).toBeUndefined();
    expect(body.db.latency_ms).toBeGreaterThanOrEqual(0);
    expect(body.db.latency_ms).toBeLessThan(1000);
  });

  test("returns 503 + ok:false when DB is closed mid-flight", async () => {
    const config = loadConfig();
    handle = await startHubHttpServer({
      serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
      hub,
      port: 0,
      host: "127.0.0.1",
    });
    // Simulate a corrupt/unmounted DB by closing the underlying handle.
    hub.db.close();
    const r = await fetch(`http://127.0.0.1:${handle.port}/healthz`);
    expect(r.status).toBe(503);
    const body = await r.json() as {
      ok: boolean;
      db: { ready: boolean; error?: string };
    };
    expect(body.ok).toBe(false);
    expect(body.db.ready).toBe(false);
    expect(typeof body.db.error).toBe("string");
  });
});
