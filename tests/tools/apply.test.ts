import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { handleApply } from "../../src/tools/apply.js";
import {
  createTestStore,
  seedStore,
  seedProject,
  type TestStore,
} from "../fixtures/setup.js";

describe("rtv_apply", () => {
  let store: TestStore;
  let tmpProject: string;

  beforeEach(async () => {
    store = createTestStore();
    await seedStore(store);
    await seedProject(store, "test-project");

    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-proj-"));
    execFileSync("git", ["init"], { cwd: tmpProject });
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# Rules");
  });

  afterEach(() => {
    store.cleanup();
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it("applies all (rules + persona)", async () => {
    const result = await handleApply(
      { project: "test-project", path: tmpProject, scope: "all" },
      { storePath: store.storePath, deviceName: "TEST-PC" }
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("반영 완료");

    // Verify rules were copied
    expect(
      fs.existsSync(path.join(tmpProject, ".claude", "rules", "core.md"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpProject, ".claude", "rules", "project.md"))
    ).toBe(true);
  });

  it("dry run does not apply", async () => {
    const result = await handleApply(
      { project: "test-project", path: tmpProject, dry_run: true },
      { storePath: store.storePath, deviceName: "TEST-PC" }
    );

    expect(result.success).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(
      fs.existsSync(path.join(tmpProject, ".claude", "rules", "core.md"))
    ).toBe(false);
  });
});
