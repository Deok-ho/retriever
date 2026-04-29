import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HubService } from "../../src/hub/service.js";
import * as sessionTools from "../../src/hub/sessions-tools.js";

describe("hub session tools", () => {
  let tmpDir: string;
  let hub: HubService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-hub-stools-"));
    hub = new HubService({
      dbPath: path.join(tmpDir, "hub.db"),
      attachmentsDir: path.join(tmpDir, "attachments"),
    });
  });

  afterEach(() => {
    hub.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("mirror → list → read → search round-trip", () => {
    const mirrored = sessionTools.mirrorSession(hub, {
      machine_id: "ms-m4x-001",
      harness: "claude_code",
      native_id: "n-rt1",
      started_at: "2026-04-29T00:00:00Z",
      last_active_at: "2026-04-29T00:01:00Z",
      transcript_content: "hello searchable world",
      content_hash: "h-rt1",
      events: [
        {
          seq: 0,
          ts: "2026-04-29T00:00:00Z",
          event_type: "user_msg",
          payload: { text: "hi" },
        },
      ],
    });
    expect(mirrored).toContain("ms-m4x-001:claude_code:n-rt1");

    const list = sessionTools.listSessions(hub, {});
    expect(list).toContain("n-rt1");

    const read = sessionTools.readSession(hub, {
      session_uid: "ms-m4x-001:claude_code:n-rt1",
      include_transcript: true,
      include_events: true,
    });
    expect(read).toContain("EVENTS:");
    expect(read).toContain("TRANSCRIPT");

    const search = sessionTools.searchSessions(hub, { query: "searchable" });
    expect(search).toContain("ms-m4x-001:claude_code:n-rt1");
  });

  test("list returns Korean placeholder when empty", () => {
    expect(sessionTools.listSessions(hub, {})).toBe("세션 없음");
  });

  test("filesTouchedByPath surfaces matching sessions", () => {
    sessionTools.mirrorSession(hub, {
      machine_id: "ms-m4x-001",
      harness: "claude_code",
      native_id: "ft1",
      started_at: "2026-04-29T00:00:00Z",
      last_active_at: "2026-04-29T00:00:00Z",
      transcript_content: "x",
      content_hash: "x",
      events: [
        {
          seq: 0,
          ts: "2026-04-29T00:00:00Z",
          event_type: "tool_use",
          tool_name: "Edit",
          payload: { file_path: "src/a.ts", args: {} },
        },
      ],
    });
    const out = sessionTools.filesTouchedByPath(hub, { file_path: "src/a.ts" });
    expect(out).toContain("ft1");
    expect(out).toContain("edit");
  });
});
