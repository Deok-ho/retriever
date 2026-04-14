import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Watchdog } from "../../src/core/watchdog.js";
import { readYaml } from "../../src/utils/yaml.js";
import {
  createTestStore,
  seedStore,
  seedProject,
  type TestStore,
} from "../fixtures/setup.js";
import type { Snapshot } from "../../src/types.js";

describe("Watchdog", () => {
  let store: TestStore;
  let tmpProject: string;
  let watchdog: Watchdog;

  beforeEach(async () => {
    store = createTestStore();
    await seedStore(store);
    await seedProject(store, "test-project");

    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-wd-"));
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# Initial");

    watchdog = new Watchdog({
      storePath: store.storePath,
      deviceName: "TEST-PC",
    });
  });

  afterEach(async () => {
    await watchdog.close();
    store.cleanup();
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it("triggers collect on file change", async () => {
    watchdog.watch("test-project", tmpProject);

    // Wait for watcher to be ready
    await new Promise((r) => setTimeout(r, 500));

    // Modify a watched file
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# Changed");

    // Wait for debounce + collect
    await new Promise((r) => setTimeout(r, 1500));

    const snapshotPath = path.join(
      store.storePath,
      "devices",
      "TEST-PC",
      "test-project",
      "snapshot.yaml"
    );
    const snapshot = await readYaml<Snapshot>(snapshotPath);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.device).toBe("TEST-PC");
  });

  it("stops watching after unwatch", async () => {
    watchdog.watch("test-project", tmpProject);
    await new Promise((r) => setTimeout(r, 500));

    watchdog.unwatch("test-project");

    // This change should not trigger collect
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# After unwatch");
    await new Promise((r) => setTimeout(r, 1000));

    // Snapshot should not exist (no collect triggered)
    const snapshotPath = path.join(
      store.storePath,
      "devices",
      "TEST-PC",
      "test-project",
      "snapshot.yaml"
    );
    const snapshot = await readYaml<Snapshot>(snapshotPath);
    expect(snapshot).toBeNull();
  });

  it("handles non-existent path gracefully", () => {
    // Should not throw
    expect(() => {
      watchdog.watch("nope", path.join(tmpProject, "nonexistent"));
    }).not.toThrow();
  });
});
