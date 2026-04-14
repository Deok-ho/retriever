import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleMemoryList } from "../../src/tools/memory-list.js";
import { handleMemorySearch } from "../../src/tools/memory-search.js";
import { handleMemoryRead } from "../../src/tools/memory-read.js";
import { handleMemoryWrite } from "../../src/tools/memory-write.js";
import { handleMemoryDelete } from "../../src/tools/memory-delete.js";
import {
  createTestStore,
  seedStore,
  seedProject,
  seedMemory,
  type TestStore,
} from "../fixtures/setup.js";

describe("Memory MCP tools", () => {
  let store: TestStore;
  const config = () => ({
    storePath: store.storePath,
    deviceName: "TEST-PC",
  });

  beforeEach(async () => {
    store = createTestStore();
    await seedStore(store);
    await seedProject(store, "test-project");
    await seedMemory(store, "test-project");
  });

  afterEach(() => {
    store.cleanup();
  });

  it("list returns all memories", async () => {
    const result = await handleMemoryList(
      { project: "test-project" },
      config()
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("global-user-profile");
    expect(result.message).toContain("project-note");
  });

  it("list filters by type", async () => {
    const result = await handleMemoryList(
      { project: "test-project", type: "user" },
      config()
    );
    expect(result.message).toContain("user-profile");
    expect(result.message).not.toContain("project-note");
  });

  it("search finds by keyword", async () => {
    const result = await handleMemorySearch(
      { project: "test-project", query: "MCP" },
      config()
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("project-note");
  });

  it("search returns no match message", async () => {
    const result = await handleMemorySearch(
      { project: "test-project", query: "zzz-no-match" },
      config()
    );
    expect(result.message).toContain("검색 결과 없음");
  });

  it("read returns memory content", async () => {
    const result = await handleMemoryRead(
      { project: "test-project", name: "project-note" },
      config()
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("MCP 서버");
  });

  it("read returns error for missing", async () => {
    const result = await handleMemoryRead(
      { project: "test-project", name: "nope" },
      config()
    );
    expect(result.success).toBe(false);
  });

  it("write → read roundtrip", async () => {
    await handleMemoryWrite(
      {
        project: "test-project",
        name: "new-mem",
        type: "reference",
        content: "새 메모리 내용\n",
        description: "테스트용 메모리",
      },
      config()
    );

    const result = await handleMemoryRead(
      { project: "test-project", name: "new-mem" },
      config()
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("새 메모리 내용");
  });

  it("delete removes project memory", async () => {
    const delResult = await handleMemoryDelete(
      { project: "test-project", name: "project-note" },
      config()
    );
    expect(delResult.success).toBe(true);

    const readResult = await handleMemoryRead(
      { project: "test-project", name: "project-note" },
      config()
    );
    expect(readResult.success).toBe(false);
  });

  it("delete refuses global memory", async () => {
    const result = await handleMemoryDelete(
      { project: "test-project", name: "global-user-profile" },
      config()
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("글로벌");
  });
});
