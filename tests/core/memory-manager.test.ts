import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { MemoryManager } from "../../src/core/memory-manager.js";
import { parseMemory } from "../../src/utils/memory-parser.js";
import {
  createTestStore,
  seedStore,
  seedProject,
  seedMemory,
  type TestStore,
} from "../fixtures/setup.js";

describe("MemoryManager", () => {
  let store: TestStore;
  let mgr: MemoryManager;

  beforeEach(async () => {
    store = createTestStore();
    await seedStore(store);
    await seedProject(store, "test-project");
    await seedMemory(store, "test-project");
    mgr = new MemoryManager({
      storePath: store.storePath,
      deviceName: "TEST-PC",
    });
  });

  afterEach(() => {
    store.cleanup();
  });

  describe("list", () => {
    it("merges global + project memories", async () => {
      const entries = await mgr.list("test-project");
      // 2 global + 1 project
      expect(entries.length).toBe(3);
      const names = entries.map((e) => e.name).sort();
      expect(names).toContain("global-user-profile");
      expect(names).toContain("global-feedback");
      expect(names).toContain("project-note");
    });

    it("filters by type", async () => {
      const entries = await mgr.list("test-project", "user");
      expect(entries.every((e) => e.type === "user")).toBe(true);
      expect(entries.length).toBe(1);
    });

    it("project overrides global with same name", async () => {
      // Create a project memory with same name as global
      const projectMemDir = path.join(
        store.storePath, "desired-state", "test-project", "memory"
      );
      fs.writeFileSync(
        path.join(projectMemDir, "global-user-profile.md"),
        "---\nname: global-user-profile\ndescription: Override\ntype: user\n---\n\nProject override\n"
      );

      const entries = await mgr.list("test-project");
      const userProfiles = entries.filter((e) => e.name === "global-user-profile");
      expect(userProfiles).toHaveLength(1);
      expect(userProfiles[0].source).toBe("project");
      expect(userProfiles[0].body).toContain("Project override");
    });

    it("returns empty when no memories exist", async () => {
      // Create a project with no memories seeded
      await seedProject(store, "empty-proj");
      const entries = await mgr.list("empty-proj");
      // Still has global memories
      expect(entries.length).toBe(2);
    });
  });

  describe("search", () => {
    it("matches keyword in name", async () => {
      const results = await mgr.search("test-project", "user-profile");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toContain("user-profile");
    });

    it("matches keyword in body", async () => {
      const results = await mgr.search("test-project", "MCP");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("project-note");
    });

    it("case insensitive", async () => {
      const results = await mgr.search("test-project", "tdd");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty for no match", async () => {
      const results = await mgr.search("test-project", "nonexistent-xyz");
      expect(results).toEqual([]);
    });
  });

  describe("read", () => {
    it("reads project memory", async () => {
      const entry = await mgr.read("test-project", "project-note");
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe("project-note");
      expect(entry!.source).toBe("project");
    });

    it("falls back to global memory", async () => {
      const entry = await mgr.read("test-project", "global-feedback");
      expect(entry).not.toBeNull();
      expect(entry!.source).toBe("global");
    });

    it("returns null for non-existent", async () => {
      const entry = await mgr.read("test-project", "nope");
      expect(entry).toBeNull();
    });
  });

  describe("write", () => {
    it("creates new memory", async () => {
      await mgr.write("test-project", {
        name: "new-mem",
        description: "Brand new",
        type: "reference",
        body: "Some reference.\n",
      });

      const entry = await mgr.read("test-project", "new-mem");
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe("reference");
      expect(entry!.source).toBe("project");
    });

    it("overwrites existing memory", async () => {
      await mgr.write("test-project", {
        name: "project-note",
        description: "Updated",
        type: "project",
        body: "Updated body.\n",
      });

      const entry = await mgr.read("test-project", "project-note");
      expect(entry!.description).toBe("Updated");
      expect(entry!.body).toBe("Updated body.\n");
    });
  });

  describe("delete", () => {
    it("deletes project memory", async () => {
      const result = await mgr.delete("test-project", "project-note");
      expect(result).toBe(true);

      const entry = await mgr.read("test-project", "project-note");
      expect(entry).toBeNull();
    });

    it("returns false for non-existent", async () => {
      const result = await mgr.delete("test-project", "nope");
      expect(result).toBe(false);
    });

    it("cannot delete global memory", async () => {
      const result = await mgr.delete("test-project", "global-user-profile");
      expect(result).toBe(false);
      // Still readable
      const entry = await mgr.read("test-project", "global-user-profile");
      expect(entry).not.toBeNull();
    });
  });
});
