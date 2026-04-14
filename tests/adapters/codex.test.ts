import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { CodexAdapter } from "../../src/adapters/codex.js";

describe("CodexAdapter", () => {
  let tmpProject: string;
  let adapter: CodexAdapter;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-codex-"));
    adapter = new CodexAdapter();
  });

  afterEach(() => {
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it("detects Codex by .codex/ directory", async () => {
    expect(await adapter.detect(tmpProject)).toBe(false);

    fs.mkdirSync(path.join(tmpProject, ".codex"), { recursive: true });
    expect(await adapter.detect(tmpProject)).toBe(true);
  });

  it("collects harness state from instructions.md", async () => {
    fs.mkdirSync(path.join(tmpProject, ".codex"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpProject, ".codex", "instructions.md"),
      "# Codex Instructions\nBe helpful.\n"
    );

    const state = await adapter.collectHarness(tmpProject);
    expect(state.instructions_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.rules_count).toBe(1);
  });

  it("returns empty harness when no instructions.md", async () => {
    fs.mkdirSync(path.join(tmpProject, ".codex"), { recursive: true });

    const state = await adapter.collectHarness(tmpProject);
    expect(state.instructions_hash).toBeUndefined();
    expect(state.rules_count).toBe(0);
  });

  it("applies rules by merging into instructions.md", async () => {
    const desiredDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-desired-"));
    fs.writeFileSync(path.join(desiredDir, "core.md"), "# Core Rules\n");
    fs.writeFileSync(path.join(desiredDir, "project.md"), "# Project Rules\n");

    await adapter.applyRules(desiredDir, tmpProject);

    const instructions = fs.readFileSync(
      path.join(tmpProject, ".codex", "instructions.md"),
      "utf-8"
    );
    expect(instructions).toContain("Core Rules");
    expect(instructions).toContain("Project Rules");

    fs.rmSync(desiredDir, { recursive: true, force: true });
  });

  it("does not support native memory", () => {
    expect(adapter.supportsNativeMemory()).toBe(false);
  });
});
