import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import { handleInit } from "../../src/tools/init.js";
import { readYaml } from "../../src/utils/yaml.js";
import { createTestStore, seedStore, type TestStore } from "../fixtures/setup.js";
import type { Manifest } from "../../src/types.js";

describe("rtv_init", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = createTestStore();
    await seedStore(store);
  });

  afterEach(() => {
    store.cleanup();
  });

  it("creates manifest for new project", async () => {
    const result = await handleInit(
      {
        name: "new-project",
        path: "C:/Dev/new-project",
        persona: "company",
      },
      { storePath: store.storePath, deviceName: "TEST-PC" }
    );

    expect(result.success).toBe(true);

    const manifest = await readYaml<Manifest>(
      path.join(
        store.storePath,
        "desired-state",
        "new-project",
        "manifest.yaml"
      )
    );
    expect(manifest!.project.name).toBe("new-project");
    expect(manifest!.persona).toBe("company");
  });

  it("rejects duplicate project", async () => {
    await handleInit(
      { name: "dup", path: "/test", persona: "personal" },
      { storePath: store.storePath, deviceName: "TEST-PC" }
    );
    const result = await handleInit(
      { name: "dup", path: "/test", persona: "personal" },
      { storePath: store.storePath, deviceName: "TEST-PC" }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("이미 존재");
  });
});
