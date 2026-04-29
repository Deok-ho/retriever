import { describe, expect, test } from "vitest";

// Smoke-load the adapter file via window-style global emulation.
// retriever-data-live.jsx assumes a browser, so we shim minimal globals.
import * as fs from "node:fs";
import * as path from "node:path";

const adapterPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
  "web",
  "retriever-data-live.jsx"
);

describe("rtvShapeRow contract — Codex iter5 #4 fix", () => {
  // Pull rtvShapeRow source from the JSX bundle — it's plain JS, so we evaluate
  // it after stubbing the window global. This guards against shape regressions
  // that would crash SessionDetail on the first live row.
  const src = fs.readFileSync(adapterPath, "utf8");
  const ctx: { window?: { RTV_LIVE?: Record<string, unknown> } } = { window: {} };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("window", src)(ctx.window);
  const RTV = ctx.window!.RTV_LIVE as { shapeRow: (s: unknown) => Record<string, unknown> };

  test("shapeRow includes empty defaults for tickets/files/tools so SessionDetail never crashes", () => {
    const r = RTV.shapeRow({
      session_uid: "m:claude_code:n",
      machine_id: "m",
      harness: "claude_code",
      native_id: "n",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:01:00Z",
      status: "active",
      bytes_total: 100,
      events_total: 5,
      commit_shas_json: "[]",
      cwd_at_start: "/x/y",
      project_id: null,
    });
    expect(Array.isArray(r.tickets)).toBe(true);
    expect(Array.isArray(r.files)).toBe(true);
    expect(typeof r.tools).toBe("object");
    expect(Array.isArray(r.commit_shas)).toBe(true);
    expect(r.live).toBe(true);
    expect(r.events).toBe(5);
    expect(r.uid).toBe("m:claude_code:n");
  });

  test("shapeRow handles missing optional fields without throwing", () => {
    const r = RTV.shapeRow({
      session_uid: "m:codex:x",
      machine_id: "m",
      harness: "codex",
      native_id: "x",
      started_at: "2026-04-30T00:00:00Z",
      last_active_at: "2026-04-30T00:00:00Z",
      status: "archived",
      // bytes_total, events_total, commit_shas_json, cwd_at_start, project_id all missing
    });
    expect(r.bytes).toBe(0);
    expect(r.events).toBe(0);
    expect(r.commit_shas).toEqual([]);
    expect(r.cwd).toBeNull();
  });

  test("eventsToTurns gracefully ignores malformed payload_json", () => {
    const turns = (RTV as unknown as { eventsToTurns: (e: unknown[]) => unknown[] }).eventsToTurns([
      { event_type: "user_msg", payload_json: "{not json}", ts: "t" },
      { event_type: "assistant_msg", payload_json: '{"text":"ok"}', ts: "t2" },
    ]);
    // First event is dropped (no parse → no text); second yields 1 assistant turn.
    expect(turns).toHaveLength(1);
    expect((turns[0] as { kind: string }).kind).toBe("assistant");
  });
});
