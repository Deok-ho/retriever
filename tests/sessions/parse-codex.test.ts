import { describe, expect, test } from "vitest";
import { parseCodexJsonl } from "../../src/sessions/parse-codex.js";

const sessionMeta = (id: string, ts: string, cwd: string) =>
  JSON.stringify({
    timestamp: ts,
    type: "session_meta",
    payload: { id, timestamp: ts, cwd, originator: "codex_cli_rs" },
  });

const eventMsg = (
  ts: string,
  payload: Record<string, unknown>
) => JSON.stringify({ timestamp: ts, type: "event_msg", payload });

const responseItem = (
  ts: string,
  payload: Record<string, unknown>
) => JSON.stringify({ timestamp: ts, type: "response_item", payload });

describe("parseCodexJsonl", () => {
  test("returns empty for empty content", () => {
    const r = parseCodexJsonl("");
    expect(r.events).toEqual([]);
    expect(r.started_at).toBeNull();
    expect(r.cwd_at_start).toBeNull();
  });

  test("session_meta surfaces native_id and cwd_at_start", () => {
    const line = sessionMeta(
      "019d2abb-11fb-7df0",
      "2026-04-29T00:00:01Z",
      "/Users/me/repo"
    );
    const r = parseCodexJsonl(line);
    expect(r.cwd_at_start).toBe("/Users/me/repo");
    expect(r.meta.native_id).toBe("019d2abb-11fb-7df0");
    expect(r.events).toHaveLength(1);
    expect(r.events[0].event_type).toBe("meta");
  });

  test("event_msg user_message → user_msg event with text", () => {
    const line = eventMsg("2026-04-29T00:00:02Z", {
      type: "user_message",
      message: "<task>do something</task>",
    });
    const r = parseCodexJsonl(line);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      event_type: "user_msg",
      payload: { text: "<task>do something</task>" },
    });
  });

  test("event_msg agent_message → assistant_msg event", () => {
    const line = eventMsg("2026-04-29T00:00:03Z", {
      type: "agent_message",
      message: "I'll do X",
    });
    const r = parseCodexJsonl(line);
    expect(r.events[0]).toMatchObject({
      event_type: "assistant_msg",
      payload: { text: "I'll do X" },
    });
  });

  test("response_item function_call → tool_use with parsed args", () => {
    const line = responseItem("2026-04-29T00:00:04Z", {
      type: "function_call",
      name: "exec_command",
      arguments: '{"cmd":"ls","workdir":"/x"}',
      call_id: "call_1",
    });
    const r = parseCodexJsonl(line);
    expect(r.events[0]).toMatchObject({
      event_type: "tool_use",
      tool_name: "exec_command",
      payload: { command: "ls", args: { cmd: "ls", workdir: "/x" } },
    });
  });

  test("function_call with file path arg surfaces file_path", () => {
    const line = responseItem("2026-04-29T00:00:05Z", {
      type: "function_call",
      name: "apply_patch",
      arguments: JSON.stringify({ file_path: "/abs/foo.ts", patch: "..." }),
    });
    const r = parseCodexJsonl(line);
    expect(r.events[0].payload.file_path).toBe("/abs/foo.ts");
  });

  test("response_item function_call_output → tool_result", () => {
    const line = responseItem("2026-04-29T00:00:06Z", {
      type: "function_call_output",
      call_id: "call_1",
      output: "files\nfoo\nbar",
    });
    const r = parseCodexJsonl(line);
    expect(r.events[0]).toMatchObject({
      event_type: "tool_result",
      payload: { result_text: "files\nfoo\nbar", is_error: false },
    });
  });

  test("response_item reasoning → thinking event", () => {
    const line = responseItem("2026-04-29T00:00:07Z", {
      type: "reasoning",
      summary: [],
      content: null,
    });
    const r = parseCodexJsonl(line);
    expect(r.events[0].event_type).toBe("thinking");
  });

  test("response_item message (developer/system role) → system event", () => {
    const line = responseItem("2026-04-29T00:00:08Z", {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: "<permissions>...</permissions>" }],
    });
    const r = parseCodexJsonl(line);
    expect(r.events[0].event_type).toBe("system");
  });

  test("token_count and other event_msg subtypes → meta", () => {
    const lines = [
      eventMsg("2026-04-29T00:00:09Z", { type: "token_count", info: null }),
      eventMsg("2026-04-29T00:00:10Z", { type: "task_complete", turn_id: "x" }),
    ].join("\n");
    const r = parseCodexJsonl(lines);
    expect(r.events.map((e) => e.event_type)).toEqual(["meta", "meta"]);
  });

  test("started_at = first ts; last_active_at = last ts", () => {
    const lines = [
      sessionMeta("id-1", "2026-04-29T00:00:01Z", "/x"),
      eventMsg("2026-04-29T00:05:00Z", { type: "task_started", turn_id: "x" }),
      eventMsg("2026-04-29T00:10:00Z", { type: "task_complete", turn_id: "x" }),
    ].join("\n");
    const r = parseCodexJsonl(lines);
    expect(r.started_at).toBe("2026-04-29T00:00:01Z");
    expect(r.last_active_at).toBe("2026-04-29T00:10:00Z");
  });

  test("falls back to native_id from filename when meta is absent", () => {
    const r = parseCodexJsonl(
      eventMsg("2026-04-29T00:00:01Z", { type: "user_message", message: "hi" }),
      { fallbackNativeId: "rollout-fallback-uid" }
    );
    expect(r.meta.native_id).toBe("rollout-fallback-uid");
  });
});
