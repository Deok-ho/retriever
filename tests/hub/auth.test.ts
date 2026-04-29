import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HubService } from "../../src/hub/service.js";
import { startHubHttpServer, type HubHttpHandle } from "../../src/hub/http-server.js";
import { createMcpServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";

describe("Hub HTTP auth — global gate (Codex iter5 #1 fix)", () => {
  let tmp: string;
  let hub: HubService;
  let handle: HubHttpHandle;
  const TOKEN = "secret-token-123";

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-auth-"));
    hub = new HubService({
      dbPath: path.join(tmp, "hub.db"),
      attachmentsDir: path.join(tmp, "attachments"),
    });
    hub.sessions.mirror({
      machine_id: "ms-m4x-001",
      harness: "claude_code",
      native_id: "secret",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:01:00Z",
      transcript_content: "API_KEY=sk-very-secret",
      content_hash: "h",
      events: [
        {
          seq: 0,
          ts: "2026-04-30T00:00:00Z",
          event_type: "user_msg",
          payload: { text: "secret content" },
        },
      ],
    });
  });

  afterEach(async () => {
    if (handle) await handle.close();
    hub.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("non-loopback bind without token throws at startup", async () => {
    const config = loadConfig();
    await expect(
      startHubHttpServer({
        serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
        hub,
        port: 0,
        host: "0.0.0.0",
        // token omitted on purpose
      })
    ).rejects.toThrow(/RTV_HUB_TOKEN/);
  });

  test("non-loopback bind with token: /healthz unauthenticated, others require Bearer", async () => {
    const config = loadConfig();
    handle = await startHubHttpServer({
      serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
      hub,
      port: 0,
      host: "0.0.0.0",
      token: TOKEN,
    });

    // /healthz: no auth needed, includes DB ping
    const health = await fetch(`http://127.0.0.1:${handle.port}/healthz`);
    expect(health.status).toBe(200);
    const hb = await health.json() as { ok: boolean; db?: { ready: boolean; latency_ms: number } };
    expect(hb.ok).toBe(true);
    expect(hb.db?.ready).toBe(true);
    expect(typeof hb.db?.latency_ms).toBe("number");

    // /api/sessions without token → 401
    const noAuth = await fetch(`http://127.0.0.1:${handle.port}/api/sessions`);
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get("www-authenticate")).toContain("Bearer");

    // /ui without token → 401
    const uiNoAuth = await fetch(`http://127.0.0.1:${handle.port}/ui/`);
    expect(uiNoAuth.status).toBe(401);

    // /api/sessions with bad token → 401
    const badAuth = await fetch(`http://127.0.0.1:${handle.port}/api/sessions`, {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(badAuth.status).toBe(401);

    // /api/sessions with correct Bearer → 200 + payload
    const ok = await fetch(`http://127.0.0.1:${handle.port}/api/sessions`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { sessions: Array<{ session_uid: string }> };
    expect(body.sessions[0].session_uid).toContain("secret");

    // ?token=… query fallback (for mobile PWA/bookmarks)
    const qtok = await fetch(
      `http://127.0.0.1:${handle.port}/api/sessions?token=${TOKEN}`
    );
    expect(qtok.status).toBe(200);

    // /mcp without token → 401 (Codex iter7 — gate must cover MCP path too)
    const mcpNoAuth = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(mcpNoAuth.status).toBe(401);
  });

  test("?token= query bootstraps an HttpOnly session cookie (Codex iter7 fix)", async () => {
    const config = loadConfig();
    handle = await startHubHttpServer({
      serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
      hub,
      port: 0,
      host: "0.0.0.0",
      token: TOKEN,
    });

    // Initial /api request with ?token= must succeed AND issue a Set-Cookie
    const r = await fetch(
      `http://127.0.0.1:${handle.port}/api/sessions?token=${TOKEN}`
    );
    expect(r.status).toBe(200);
    const setCookie = r.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie!).toMatch(/rtv_hub_session=/);
    expect(setCookie!).toMatch(/HttpOnly/);
    expect(setCookie!).toMatch(/SameSite=Lax/);

    // Extract the cookie value and verify subsequent request without ?token= works
    const m = setCookie!.match(/rtv_hub_session=([^;]+)/);
    expect(m).not.toBeNull();
    const cookieVal = decodeURIComponent(m![1]);
    expect(cookieVal).toBe(TOKEN);

    const r2 = await fetch(`http://127.0.0.1:${handle.port}/api/sessions`, {
      headers: { Cookie: `rtv_hub_session=${encodeURIComponent(TOKEN)}` },
    });
    expect(r2.status).toBe(200);

    // Static /ui asset (jsx) reachable with cookie alone
    const r3 = await fetch(`http://127.0.0.1:${handle.port}/ui/retriever-data.jsx`, {
      headers: { Cookie: `rtv_hub_session=${encodeURIComponent(TOKEN)}` },
    });
    expect(r3.status).toBe(200);
  });

  test("/ui/?token=… redirects to clean URL (strip secret from address bar)", async () => {
    const config = loadConfig();
    handle = await startHubHttpServer({
      serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
      hub,
      port: 0,
      host: "0.0.0.0",
      token: TOKEN,
    });
    const r = await fetch(`http://127.0.0.1:${handle.port}/ui/?token=${TOKEN}`, {
      redirect: "manual",
    });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/ui/");
    expect(r.headers.get("set-cookie")).toMatch(/rtv_hub_session=/);
  });

  test("loopback bind: token optional, no auth enforced", async () => {
    const config = loadConfig();
    handle = await startHubHttpServer({
      serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
      hub,
      port: 0,
      host: "127.0.0.1",
      // no token, no auth required on loopback
    });
    const r = await fetch(`http://127.0.0.1:${handle.port}/api/sessions`);
    expect(r.status).toBe(200);
  });

  test("transcript content stays gated behind auth", async () => {
    const config = loadConfig();
    handle = await startHubHttpServer({
      serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
      hub,
      port: 0,
      host: "0.0.0.0",
      token: TOKEN,
    });
    const noAuth = await fetch(
      `http://127.0.0.1:${handle.port}/api/sessions/${encodeURIComponent("ms-m4x-001:claude_code:secret")}?transcript=1`
    );
    expect(noAuth.status).toBe(401);

    const withAuth = await fetch(
      `http://127.0.0.1:${handle.port}/api/sessions/${encodeURIComponent("ms-m4x-001:claude_code:secret")}?transcript=1`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    expect(withAuth.status).toBe(200);
    const body = (await withAuth.json()) as { transcript?: { content: string } };
    expect(body.transcript?.content).toContain("API_KEY");
  });
});
