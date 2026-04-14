import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { handleStatus } from "../../src/tools/status.js";
import {
  createTestStore,
  seedStore,
  seedProject,
  type TestStore,
} from "../fixtures/setup.js";

describe("rtv_status", () => {
  let store: TestStore;
  let tmpProject: string;

  beforeEach(async () => {
    store = createTestStore();
    await seedStore(store);
    await seedProject(store, "test-project");

    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-proj-"));
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# Rules");
  });

  afterEach(() => {
    store.cleanup();
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it("auto-collects and returns formatted report", async () => {
    const result = await handleStatus(
      { project: "test-project", path: tmpProject },
      { storePath: store.storePath, deviceName: "TEST-PC" }
    );

    expect(result.success).toBe(true);
    expect(result.formatted).toContain("test-project");
    expect(result.formatted).toContain("TEST-PC");
    expect(result.report.items.length).toBeGreaterThan(0);
  });
});
