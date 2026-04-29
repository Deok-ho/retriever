import { describe, expect, test, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HubService } from "../../src/hub/service.js";
import {
  captureSessions,
  installGitHook,
  uninstallGitHook,
  resolveMachineId,
} from "../../src/sessions/capture.js";

describe("resolveMachineId", () => {
  test("uses RTV_MACHINE_ID env when set", () => {
    expect(resolveMachineId({ env: { RTV_MACHINE_ID: "custom-001" } })).toBe(
      "custom-001"
    );
  });
  test("falls back to provided fallback when env missing", () => {
    expect(
      resolveMachineId({ env: {}, fallback: "hostname-fallback" })
    ).toBe("hostname-fallback");
  });
  test("strips whitespace and lowercases", () => {
    expect(resolveMachineId({ env: { RTV_MACHINE_ID: "  Foo-BAR  " } })).toBe(
      "foo-bar"
    );
  });
});

describe("captureSessions", () => {
  let tmp: string;
  let hub: HubService;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-cap-"));
    hub = new HubService({
      dbPath: path.join(tmp, "hub.db"),
      attachmentsDir: path.join(tmp, "attachments"),
    });
  });

  afterEach(() => {
    hub.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeClaudeJsonl(filePath: string, lines: string[]): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, lines.join("\n"));
  }

  test("scans Claude Code dirs and mirrors sessions to hub DB", async () => {
    const claudeRoot = path.join(tmp, ".claude/projects");
    writeClaudeJsonl(
      path.join(claudeRoot, "-Users-me-repo/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"),
      [
        JSON.stringify({
          type: "user",
          timestamp: "2026-04-29T00:00:01Z",
          cwd: "/Users/me/repo",
          message: { role: "user", content: "hi" },
        }),
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-04-29T00:00:02Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "hello" }],
          },
        }),
      ]
    );

    const result = await captureSessions({
      hub,
      machineId: "ms-m4x-001",
      claudeProjectsDir: claudeRoot,
      codexSessionsDir: path.join(tmp, "no-codex"),
      stateFile: path.join(tmp, "capture-state.json"),
    });

    expect(result.scanned).toBe(1);
    expect(result.mirrored).toBe(1);
    expect(result.skipped).toBe(0);
    const list = hub.sessions.list({ harness: "claude_code" });
    expect(list).toHaveLength(1);
    expect(list[0].native_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(list[0].machine_id).toBe("ms-m4x-001");
    expect(list[0].cwd_at_start).toBe("/Users/me/repo");
  });

  test("scans Codex dirs and mirrors as harness=codex", async () => {
    const codexRoot = path.join(tmp, ".codex/sessions/2026/04/29");
    writeClaudeJsonl(path.join(codexRoot, "rollout-2026-04-29-019d.jsonl"), [
      JSON.stringify({
        timestamp: "2026-04-29T00:00:01Z",
        type: "session_meta",
        payload: { id: "019d-test", timestamp: "2026-04-29T00:00:01Z", cwd: "/X" },
      }),
      JSON.stringify({
        timestamp: "2026-04-29T00:00:02Z",
        type: "event_msg",
        payload: { type: "user_message", message: "hi" },
      }),
    ]);
    const result = await captureSessions({
      hub,
      machineId: "ms-m4x-001",
      claudeProjectsDir: path.join(tmp, "no-claude"),
      codexSessionsDir: codexRoot,
      stateFile: path.join(tmp, "capture-state.json"),
    });
    expect(result.mirrored).toBe(1);
    const codex = hub.sessions.list({ harness: "codex" });
    expect(codex).toHaveLength(1);
    expect(codex[0].native_id).toBe("019d-test");
  });

  test("skips files whose content_hash unchanged on second run", async () => {
    const claudeRoot = path.join(tmp, ".claude/projects");
    const file = path.join(
      claudeRoot,
      "-x/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"
    );
    writeClaudeJsonl(file, [
      JSON.stringify({
        type: "user",
        timestamp: "2026-04-29T00:00:00Z",
        message: { role: "user", content: "hi" },
      }),
    ]);
    await captureSessions({
      hub,
      machineId: "m",
      claudeProjectsDir: claudeRoot,
      codexSessionsDir: path.join(tmp, "no-codex"),
      stateFile: path.join(tmp, "state.json"),
    });
    const second = await captureSessions({
      hub,
      machineId: "m",
      claudeProjectsDir: claudeRoot,
      codexSessionsDir: path.join(tmp, "no-codex"),
      stateFile: path.join(tmp, "state.json"),
    });
    expect(second.skipped).toBe(1);
    expect(second.mirrored).toBe(0);
  });

  test("commit_sha is appended when supplied", async () => {
    const claudeRoot = path.join(tmp, ".claude/projects");
    writeClaudeJsonl(
      path.join(claudeRoot, "-r/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"),
      [
        JSON.stringify({
          type: "user",
          timestamp: "2026-04-29T00:00:00Z",
          message: { role: "user", content: "hi" },
        }),
      ]
    );
    await captureSessions({
      hub,
      machineId: "m",
      claudeProjectsDir: claudeRoot,
      codexSessionsDir: path.join(tmp, "no-codex"),
      stateFile: path.join(tmp, "state.json"),
      commitSha: "deadbeef",
    });
    const row = hub.sessions.list({})[0];
    expect(JSON.parse(row.commit_shas_json)).toEqual(["deadbeef"]);
  });
});

describe("git hook install/uninstall", () => {
  let tmpRepo: string;
  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-hook-"));
    fs.mkdirSync(path.join(tmpRepo, ".git", "hooks"), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  test("installs idempotent post-commit hook", () => {
    const r1 = installGitHook({ repoPath: tmpRepo });
    expect(r1.installed).toBe(true);
    const hookPath = path.join(tmpRepo, ".git", "hooks", "post-commit");
    expect(fs.existsSync(hookPath)).toBe(true);
    const stat = fs.statSync(hookPath);
    expect((stat.mode & 0o111) !== 0).toBe(true); // executable
    const content = fs.readFileSync(hookPath, "utf8");
    expect(content).toContain("retriever client capture-sessions");
    expect(content).toContain("Created by `retriever git-hook install`");

    // Idempotent
    const r2 = installGitHook({ repoPath: tmpRepo });
    expect(r2.installed).toBe(true);
    expect(r2.alreadyManaged).toBe(true);
  });

  test("refuses to overwrite a foreign existing hook", () => {
    const hookPath = path.join(tmpRepo, ".git", "hooks", "post-commit");
    fs.writeFileSync(hookPath, "#!/bin/sh\necho mine\n", { mode: 0o755 });
    expect(() => installGitHook({ repoPath: tmpRepo })).toThrow(/foreign/);
  });

  test("uninstall removes only retriever-managed hook", () => {
    installGitHook({ repoPath: tmpRepo });
    const r = uninstallGitHook({ repoPath: tmpRepo });
    expect(r.removed).toBe(true);
    expect(
      fs.existsSync(path.join(tmpRepo, ".git", "hooks", "post-commit"))
    ).toBe(false);
  });
});
