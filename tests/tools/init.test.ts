import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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

  it("auto-detects codex harness", async () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-init-"));
    fs.mkdirSync(path.join(tmpProject, ".codex"), { recursive: true });

    const result = await handleInit(
      { name: "codex-proj", path: tmpProject, persona: "personal" },
      { storePath: store.storePath, deviceName: "TEST-PC" }
    );
    expect(result.success).toBe(true);

    const manifest = await readYaml<Manifest>(
      path.join(store.storePath, "desired-state", "codex-proj", "manifest.yaml")
    );
    expect(manifest!.harness["codex"]).toBeDefined();
    expect(manifest!.harness["codex"].instructions).toBe("./rules/");

    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it("defaults to claude-code when nothing detected", async () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-init-"));

    const result = await handleInit(
      { name: "empty-proj", path: tmpProject, persona: "personal" },
      { storePath: store.storePath, deviceName: "TEST-PC" }
    );
    expect(result.success).toBe(true);

    const manifest = await readYaml<Manifest>(
      path.join(store.storePath, "desired-state", "empty-proj", "manifest.yaml")
    );
    expect(manifest!.harness["claude-code"]).toBeDefined();

    fs.rmSync(tmpProject, { recursive: true, force: true });
  });
});
