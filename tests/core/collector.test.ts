import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Collector } from "../../src/core/collector.js";
import { readYaml } from "../../src/utils/yaml.js";
import {
  createTestStore,
  seedStore,
  seedProject,
  type TestStore,
} from "../fixtures/setup.js";
import type { Snapshot } from "../../src/types.js";

describe("Collector", () => {
  let store: TestStore;
  let tmpProject: string;

  beforeEach(async () => {
    store = createTestStore();
    await seedStore(store);
    await seedProject(store, "test-project");

    // Create a fake project directory with CLAUDE.md
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-proj-"));
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# Test Rules");
  });

  afterEach(() => {
    store.cleanup();
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it("collects snapshot and writes to device folder", async () => {
    const collector = new Collector({
      storePath: store.storePath,
      deviceName: store.deviceName,
    });

    await collector.collect("test-project", tmpProject);

    const snapshotPath = path.join(
      store.storePath,
      "devices",
      store.deviceName,
      "test-project",
      "snapshot.yaml"
    );
    const snapshot = await readYaml<Snapshot>(snapshotPath);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.device).toBe("TEST-PC");
    expect(snapshot!.harness["claude-code"]).toBeDefined();
    expect(snapshot!.harness["claude-code"].rules_count).toBeGreaterThanOrEqual(1);
    expect(snapshot!.collected_at).toBeTruthy();
  });

  it("detects env variable presence", async () => {
    process.env.ANTHROPIC_API_KEY = "test-value";

    const collector = new Collector({
      storePath: store.storePath,
      deviceName: store.deviceName,
    });

    await collector.collect("test-project", tmpProject);

    const snapshotPath = path.join(
      store.storePath,
      "devices",
      store.deviceName,
      "test-project",
      "snapshot.yaml"
    );
    const snapshot = await readYaml<Snapshot>(snapshotPath);

    expect(snapshot!.env.ANTHROPIC_API_KEY).toBe("set");

    delete process.env.ANTHROPIC_API_KEY;
  });
});
