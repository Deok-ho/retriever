import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HubService } from "../../src/hub/service.js";
import { RedactionRequiredError } from "../../src/sessions/repo.js";

const baseInput = {
  machine_id: "m",
  harness: "claude_code" as const,
  native_id: "ttttuuuu-bbbb-cccc-dddd-eeeeeeeeeeee",
  cwd_at_start: "/r",
  started_at: "2026-04-30T00:00:00Z",
  last_active_at: "2026-04-30T00:00:01Z",
  events: [
    {
      seq: 0,
      ts: "2026-04-30T00:00:00Z",
      event_type: "user_msg" as const,
      payload: { text: "hi" },
      is_error: false,
    },
  ],
  content_hash: "ignored",
};

describe("hub linter — mirror redaction enforcement", () => {
  let tmp: string;
  let hub: HubService;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-mirror-redact-"));
    hub = new HubService({
      dbPath: path.join(tmp, "hub.db"),
      attachmentsDir: path.join(tmp, "attachments"),
    });
  });
  afterEach(() => {
    hub.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("rejects raw transcript containing secret (default enforce=true)", () => {
    const transcript =
      'sk-ant-api03-LEAKEDABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd in the wild';
    expect(() =>
      hub.sessions.mirror({
        ...baseInput,
        transcript_content: transcript,
      })
    ).toThrowError(RedactionRequiredError);
    expect(hub.sessions.list({})).toHaveLength(0);
  });

  test("error reports pattern names but not the secret value", () => {
    const transcript =
      'sk-ant-api03-LEAKEDABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd plus gho_abcdefghijklmnopqrstuvwxyz0123456789AAAA';
    try {
      hub.sessions.mirror({
        ...baseInput,
        transcript_content: transcript,
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RedactionRequiredError);
      const e = err as RedactionRequiredError;
      expect(e.message).toContain("anthropic_key");
      expect(e.message).toContain("github_token");
      expect(e.message).not.toContain("LEAKED");
      expect(e.message).not.toContain("gho_");
      expect(e.patterns).toEqual(
        expect.arrayContaining(["anthropic_key", "github_token"])
      );
    }
  });

  test("accepts already-redacted transcript", () => {
    const transcript = "before ***REDACTED:anthropic_key*** after";
    const row = hub.sessions.mirror({
      ...baseInput,
      transcript_content: transcript,
    });
    expect(row.session_uid).toBe("m:claude_code:ttttuuuu-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  test("enforce_redaction=false bypasses linter", () => {
    const transcript =
      'sk-ant-api03-LEAKEDABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd raw on purpose';
    const row = hub.sessions.mirror({
      ...baseInput,
      transcript_content: transcript,
      enforce_redaction: false,
    });
    expect(row.session_uid).toBeTruthy();
    expect(hub.sessions.list({})).toHaveLength(1);
  });
});
