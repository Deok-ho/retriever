import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code.js";

describe("ClaudeCodeAdapter", () => {
  let tmpProject: string;
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-cc-"));
    adapter = new ClaudeCodeAdapter();
  });

  afterEach(() => {
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it("detects Claude Code by CLAUDE.md presence", async () => {
    // No CLAUDE.md → not detected
    expect(await adapter.detect(tmpProject)).toBe(false);

    // Create CLAUDE.md → detected
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# Rules");
    expect(await adapter.detect(tmpProject)).toBe(true);
  });

  it("collects harness state", async () => {
    // Create mock Claude Code structure
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# Rules");
    fs.mkdirSync(path.join(tmpProject, ".claude", "rules"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpProject, ".claude", "rules", "r1.md"),
      "rule 1"
    );

    const state = await adapter.collectHarness(tmpProject);
    expect(state.rules_count).toBe(2); // CLAUDE.md + r1.md
    expect(state.rules_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("applies rules from desired to project", async () => {
    // Create desired rules
    const desiredDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-desired-"));
    fs.writeFileSync(path.join(desiredDir, "core.md"), "# Core\n");

    // Create target project with .claude/rules/
    fs.mkdirSync(path.join(tmpProject, ".claude", "rules"), {
      recursive: true,
    });

    await adapter.applyRules(desiredDir, tmpProject);

    const applied = fs.readFileSync(
      path.join(tmpProject, ".claude", "rules", "core.md"),
      "utf-8"
    );
    expect(applied).toBe("# Core\n");

    fs.rmSync(desiredDir, { recursive: true, force: true });
  });

  it("reports native memory support", () => {
    expect(adapter.supportsNativeMemory()).toBe(true);
  });
});
