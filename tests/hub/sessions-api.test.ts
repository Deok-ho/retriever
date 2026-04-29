import { describe, expect, test, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HubService } from "../../src/hub/service.js";
import { startHubHttpServer, type HubHttpHandle } from "../../src/hub/http-server.js";
import { createMcpServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";

describe("HTTP /api/sessions* (read-only viewer)", () => {
  let tmp: string;
  let hub: HubService;
  let handle: HubHttpHandle;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-api-sess-"));
    hub = new HubService({
      dbPath: path.join(tmp, "hub.db"),
      attachmentsDir: path.join(tmp, "attachments"),
    });

    // Seed some data
    hub.sessions.mirror({
      machine_id: "ms-m4x-001",
      harness: "claude_code",
      native_id: "api-1",
      started_at: "2026-04-29T00:00:00Z",
      last_active_at: "2026-04-29T00:01:00Z",
      transcript_content: "the quick brown fox jumps over",
      content_hash: "h1",
      events: [
        {
          seq: 0,
          ts: "2026-04-29T00:00:00Z",
          event_type: "user_msg",
          payload: { text: "fox" },
        },
        {
          seq: 1,
          ts: "2026-04-29T00:00:01Z",
          event_type: "tool_use",
          tool_name: "Edit",
          payload: { file_path: "src/api/test.ts", args: {} },
        },
      ],
    });

    const config = loadConfig();
    handle = await startHubHttpServer({
      serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
      hub,
      port: 0, // auto-assign
      host: "127.0.0.1",
    });
  });

  afterAll(async () => {
    await handle.close();
    hub.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function get(p: string): Promise<{ status: number; body: unknown }> {
    return fetch(`http://127.0.0.1:${handle.port}${p}`).then(async (r) => ({
      status: r.status,
      body: await r.json(),
    }));
  }

  test("GET /api/sessions returns mirrored sessions", async () => {
    const r = await get("/api/sessions");
    expect(r.status).toBe(200);
    const body = r.body as { sessions: Array<{ session_uid: string }> };
    expect(body.sessions.length).toBe(1);
    expect(body.sessions[0].session_uid).toBe("ms-m4x-001:claude_code:api-1");
  });

  test("GET /api/sessions filters by harness", async () => {
    const r = await get("/api/sessions?harness=codex");
    const body = r.body as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(0);
  });

  test("GET /api/sessions/:uid returns session + events", async () => {
    const r = await get(
      "/api/sessions/" + encodeURIComponent("ms-m4x-001:claude_code:api-1")
    );
    expect(r.status).toBe(200);
    const body = r.body as {
      session: { native_id: string };
      events?: unknown[];
    };
    expect(body.session.native_id).toBe("api-1");
    expect(body.events?.length).toBe(2);
  });

  test("GET /api/sessions/:uid with transcript=1 includes content", async () => {
    const r = await get(
      "/api/sessions/" +
        encodeURIComponent("ms-m4x-001:claude_code:api-1") +
        "?transcript=1"
    );
    const body = r.body as { transcript?: { content: string } };
    expect(body.transcript?.content).toContain("brown");
  });

  test("GET /api/sessions/search?q=fox returns hit", async () => {
    const r = await get("/api/sessions/search?q=fox");
    expect(r.status).toBe(200);
    const body = r.body as {
      hits: Array<{ session_uid: string; snippet: string }>;
    };
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0].session_uid).toContain("api-1");
  });

  test("GET /api/sessions/files?file_path returns matching sessions", async () => {
    const r = await get(
      "/api/sessions/files?file_path=" + encodeURIComponent("src/api/test.ts")
    );
    expect(r.status).toBe(200);
    const body = r.body as { sessions: Array<{ native_id: string }> };
    expect(body.sessions[0].native_id).toBe("api-1");
  });

  test("404 on unknown session_uid", async () => {
    const r = await get("/api/sessions/" + encodeURIComponent("none:none:none"));
    expect(r.status).toBe(404);
  });

  test("400 on search without q", async () => {
    const r = await get("/api/sessions/search");
    expect(r.status).toBe(400);
  });
});

describe("HTTP /api/sessions/daily", () => {
  let tmp: string;
  let hub: import("../../src/hub/service.js").HubService;
  let handle: import("../../src/hub/http-server.js").HubHttpHandle;

  beforeAll(async () => {
    const { HubService } = await import("../../src/hub/service.js");
    const { startHubHttpServer } = await import("../../src/hub/http-server.js");
    const { createMcpServer } = await import("../../src/server.js");
    const { loadConfig } = await import("../../src/config.js");
    tmp = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "rtv-api-daily-"));
    hub = new HubService({
      dbPath: (await import("node:path")).join(tmp, "hub.db"),
      attachmentsDir: (await import("node:path")).join(tmp, "attachments"),
    });
    hub.sessions.mirror({
      machine_id: "ms-m4x-001",
      harness: "claude_code",
      native_id: "daily-1",
      started_at: "2026-04-30T01:00:00Z",
      last_active_at: "2026-04-30T01:30:00Z",
      transcript_content: "x",
      content_hash: "h",
      events: [
        { seq: 0, ts: "2026-04-30T01:00:00Z", event_type: "user_msg", payload: { text: "today's task" } },
        { seq: 1, ts: "2026-04-30T01:01:00Z", event_type: "tool_use", tool_name: "Bash", payload: { command: "ls", args: {} } },
        { seq: 2, ts: "2026-04-30T01:02:00Z", event_type: "assistant_msg", payload: { text: "done" } },
      ],
    });
    const config = loadConfig();
    handle = await startHubHttpServer({
      serverFactory: () => createMcpServer({ config, hub, mode: "hub" }),
      hub,
      port: 0,
      host: "127.0.0.1",
    });
  });

  afterAll(async () => {
    await handle.close();
    hub.close();
    const fs = await import("node:fs");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("GET /api/sessions/daily returns sessions with summary", async () => {
    const r = await fetch(
      `http://127.0.0.1:${handle.port}/api/sessions/daily?since=2026-04-30T00:00:00Z&until=2026-04-30T23:59:59Z`
    );
    expect(r.status).toBe(200);
    const body = await r.json() as {
      sessions: Array<{ session_uid: string; summary: { first_user_msg: string; last_assistant_msg: string; tool_counts: Record<string, number> } }>;
    };
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].summary.first_user_msg).toBe("today's task");
    expect(body.sessions[0].summary.last_assistant_msg).toBe("done");
    expect(body.sessions[0].summary.tool_counts).toEqual({ Bash: 1 });
  });

  test("400 when since/until missing", async () => {
    const r = await fetch(`http://127.0.0.1:${handle.port}/api/sessions/daily`);
    expect(r.status).toBe(400);
  });
});
