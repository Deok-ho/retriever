import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import { Differ } from "../../src/core/differ.js";
import { writeYaml } from "../../src/utils/yaml.js";
import {
  createTestStore,
  seedStore,
  seedProject,
  type TestStore,
} from "../fixtures/setup.js";
import type { Snapshot } from "../../src/types.js";

describe("Differ", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = createTestStore();
    await seedStore(store);
    await seedProject(store, "test-project");
  });

  afterEach(() => {
    store.cleanup();
  });

  it("reports match when snapshot matches desired state", async () => {
    const snapshot: Snapshot = {
      repo: {
        path: "/test",
        branch: "main",
        last_commit: "abc",
        dirty: false,
        uncommitted_files: 0,
        remote: "",
        remote_sync: "up to date",
      },
      harness: { "claude-code": { rules_count: 1, rules_hash: "abc" } },
      env: { ANTHROPIC_API_KEY: "set", TEST_KEY: "set" },
      persona: { current: "company", desired: "company", match: true },
      collected_at: new Date().toISOString(),
      device: "TEST-PC",
    };
    await writeYaml(
      path.join(
        store.storePath,
        "devices",
        "TEST-PC",
        "test-project",
        "snapshot.yaml"
      ),
      snapshot
    );

    const differ = new Differ({
      storePath: store.storePath,
      deviceName: "TEST-PC",
    });
    const report = await differ.diff("test-project");

    expect(report.items.filter((i) => i.status === "match").length).toBeGreaterThan(0);
    expect(report.summary.mismatch).toBe(0);
  });

  it("detects persona mismatch", async () => {
    const snapshot: Snapshot = {
      repo: {
        path: "/test",
        branch: "main",
        last_commit: "abc",
        dirty: false,
        uncommitted_files: 0,
        remote: "",
        remote_sync: "",
      },
      harness: {},
      env: { ANTHROPIC_API_KEY: "set" },
      persona: { current: "personal", desired: "company", match: false },
      collected_at: new Date().toISOString(),
      device: "TEST-PC",
    };
    await writeYaml(
      path.join(
        store.storePath,
        "devices",
        "TEST-PC",
        "test-project",
        "snapshot.yaml"
      ),
      snapshot
    );

    const differ = new Differ({
      storePath: store.storePath,
      deviceName: "TEST-PC",
    });
    const report = await differ.diff("test-project");

    const personaItem = report.items.find((i) => i.scope === "persona");
    expect(personaItem).toBeDefined();
    expect(personaItem!.status).toBe("mismatch");
  });

  it("detects missing env variable", async () => {
    const snapshot: Snapshot = {
      repo: {
        path: "/test",
        branch: "main",
        last_commit: "abc",
        dirty: false,
        uncommitted_files: 0,
        remote: "",
        remote_sync: "",
      },
      harness: {},
      env: { ANTHROPIC_API_KEY: "missing" },
      persona: { current: "company", desired: "company", match: true },
      collected_at: new Date().toISOString(),
      device: "TEST-PC",
    };
    await writeYaml(
      path.join(
        store.storePath,
        "devices",
        "TEST-PC",
        "test-project",
        "snapshot.yaml"
      ),
      snapshot
    );

    const differ = new Differ({
      storePath: store.storePath,
      deviceName: "TEST-PC",
    });
    const report = await differ.diff("test-project");

    const envItem = report.items.find(
      (i) => i.scope === "env" && i.status === "missing"
    );
    expect(envItem).toBeDefined();
    expect(envItem!.message).toContain("ANTHROPIC_API_KEY");
  });
});
