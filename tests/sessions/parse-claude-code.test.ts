import { describe, expect, test } from "vitest";
import { parseClaudeCodeJsonl } from "../../src/sessions/parse-claude-code.js";

const userMsg = (text: string, ts: string, cwd?: string) =>
  JSON.stringify({
    type: "user",
    timestamp: ts,
    sessionId: "sess-1",
    cwd,
    message: { role: "user", content: text },
  });

const assistantMsg = (
  ts: string,
  content: Array<Record<string, unknown>>
) =>
  JSON.stringify({
    type: "assistant",
    timestamp: ts,
    sessionId: "sess-1",
    message: { role: "assistant", content },
  });

const userToolResult = (
  ts: string,
  toolUseId: string,
  text: string,
  isError = false
) =>
  JSON.stringify({
    type: "user",
    timestamp: ts,
    sessionId: "sess-1",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: toolUseId, content: text, is_error: isError },
      ],
    },
  });

describe("parseClaudeCodeJsonl", () => {
  test("returns empty result for empty content", () => {
    const r = parseClaudeCodeJsonl("");
    expect(r.events).toEqual([]);
    expect(r.started_at).toBeNull();
    expect(r.last_active_at).toBeNull();
    expect(r.cwd_at_start).toBeNull();
  });

  test("parses user string message → user_msg event", () => {
    const r = parseClaudeCodeJsonl(
      userMsg("hello world", "2026-04-29T00:00:01Z", "/Users/me/repo")
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      seq: 0,
      event_type: "user_msg",
      ts: "2026-04-29T00:00:01Z",
      payload: { text: "hello world" },
    });
    expect(r.cwd_at_start).toBe("/Users/me/repo");
    expect(r.started_at).toBe("2026-04-29T00:00:01Z");
    expect(r.last_active_at).toBe("2026-04-29T00:00:01Z");
  });

  test("expands assistant content array into per-item events", () => {
    const lines = assistantMsg("2026-04-29T00:00:02Z", [
      { type: "thinking", thinking: "" },
      { type: "text", text: "answer" },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "Bash",
        input: { command: "ls", description: "list" },
      },
    ]);
    const r = parseClaudeCodeJsonl(lines);
    expect(r.events.map((e) => e.event_type)).toEqual([
      "thinking",
      "assistant_msg",
      "tool_use",
    ]);
    const toolUse = r.events.find((e) => e.event_type === "tool_use")!;
    expect(toolUse.tool_name).toBe("Bash");
    expect(toolUse.payload.command).toBe("ls");
    expect(toolUse.payload.args).toMatchObject({ command: "ls" });
    const text = r.events.find((e) => e.event_type === "assistant_msg")!;
    expect(text.payload.text).toBe("answer");
  });

  test("captures file_path from Edit/Write tool_use", () => {
    const r = parseClaudeCodeJsonl(
      assistantMsg("2026-04-29T00:00:03Z", [
        {
          type: "tool_use",
          id: "toolu_2",
          name: "Edit",
          input: {
            file_path: "/abs/src/foo.ts",
            old_string: "a",
            new_string: "b",
          },
        },
      ])
    );
    expect(r.events[0].tool_name).toBe("Edit");
    expect(r.events[0].payload.file_path).toBe("/abs/src/foo.ts");
  });

  test("user content with tool_result becomes tool_result event", () => {
    const r = parseClaudeCodeJsonl(
      userToolResult("2026-04-29T00:00:04Z", "toolu_3", "out", false)
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      event_type: "tool_result",
      payload: { result_text: "out", is_error: false },
    });
  });

  test("flags is_error=true on failed tool_result", () => {
    const r = parseClaudeCodeJsonl(
      userToolResult("2026-04-29T00:00:05Z", "toolu_4", "boom", true)
    );
    expect(r.events[0].payload.is_error).toBe(true);
  });

  test("system event mapped to event_type=system", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "stop_hook_summary",
      timestamp: "2026-04-29T00:00:06Z",
      sessionId: "sess-1",
    });
    const r = parseClaudeCodeJsonl(line);
    expect(r.events[0].event_type).toBe("system");
  });

  test("skips bookkeeping types lacking ts (last-prompt, permission-mode, file-history-snapshot)", () => {
    const lines = [
      JSON.stringify({ type: "last-prompt", sessionId: "sess-1" }),
      JSON.stringify({ type: "permission-mode", sessionId: "sess-1" }),
      JSON.stringify({ type: "file-history-snapshot", messageId: "x" }),
    ].join("\n");
    const r = parseClaudeCodeJsonl(lines);
    expect(r.events).toEqual([]);
  });

  test("attachment with timestamp is preserved as meta", () => {
    const line = JSON.stringify({
      type: "attachment",
      timestamp: "2026-04-29T00:00:07Z",
      sessionId: "sess-1",
      attachment: { type: "hook_success", hookName: "SessionStart" },
    });
    const r = parseClaudeCodeJsonl(line);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].event_type).toBe("meta");
  });

  test("ignores malformed JSON lines (best-effort)", () => {
    const r = parseClaudeCodeJsonl(
      `{not json}\n${userMsg("hi", "2026-04-29T00:00:08Z")}\n{also bad}`
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0].payload.text).toBe("hi");
  });

  test("started_at is earliest, last_active_at is latest ts (regardless of file order)", () => {
    const lines = [
      userMsg("third", "2026-04-29T00:03:00Z"),
      userMsg("first", "2026-04-29T00:01:00Z"),
      userMsg("second", "2026-04-29T00:02:00Z"),
    ].join("\n");
    const r = parseClaudeCodeJsonl(lines);
    expect(r.started_at).toBe("2026-04-29T00:01:00Z");
    expect(r.last_active_at).toBe("2026-04-29T00:03:00Z");
  });
});
