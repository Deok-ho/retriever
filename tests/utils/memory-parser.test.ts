import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseMemory,
  serializeMemory,
  listMemoryDir,
} from "../../src/utils/memory-parser.js";
import type { MemoryEntry } from "../../src/types.js";

describe("memory-parser", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-mem-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("parseMemory", () => {
    it("parses frontmatter + body", async () => {
      const filePath = path.join(tmpDir, "test.md");
      fs.writeFileSync(
        filePath,
        "---\nname: test-mem\ndescription: A test\ntype: user\n---\n\nBody content here.\n"
      );

      const entry = await parseMemory(filePath);
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe("test-mem");
      expect(entry!.description).toBe("A test");
      expect(entry!.type).toBe("user");
      expect(entry!.body).toBe("Body content here.\n");
      expect(entry!.filePath).toBe(filePath);
    });

    it("returns null for file without frontmatter", async () => {
      const filePath = path.join(tmpDir, "no-fm.md");
      fs.writeFileSync(filePath, "Just plain text\n");

      const entry = await parseMemory(filePath);
      expect(entry).toBeNull();
    });

    it("handles frontmatter only (no body)", async () => {
      const filePath = path.join(tmpDir, "fm-only.md");
      fs.writeFileSync(
        filePath,
        "---\nname: empty-body\ndescription: No body\ntype: feedback\n---\n"
      );

      const entry = await parseMemory(filePath);
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe("empty-body");
      expect(entry!.body).toBe("");
    });

    it("returns null for non-existent file", async () => {
      const entry = await parseMemory(path.join(tmpDir, "nope.md"));
      expect(entry).toBeNull();
    });

    it("handles korean content", async () => {
      const filePath = path.join(tmpDir, "korean.md");
      fs.writeFileSync(
        filePath,
        "---\nname: 한국어메모리\ndescription: 테스트 설명\ntype: project\n---\n\n한국어 본문입니다.\n"
      );

      const entry = await parseMemory(filePath);
      expect(entry!.name).toBe("한국어메모리");
      expect(entry!.body).toContain("한국어 본문");
    });
  });

  describe("serializeMemory", () => {
    it("serializes entry to frontmatter + body", () => {
      const entry: MemoryEntry = {
        name: "test",
        description: "A test memory",
        type: "user",
        body: "Some content.\n",
      };
      const result = serializeMemory(entry);
      expect(result).toContain("---");
      expect(result).toContain("name: test");
      expect(result).toContain("type: user");
      expect(result).toContain("Some content.\n");
    });

    it("handles korean content", () => {
      const entry: MemoryEntry = {
        name: "피드백",
        description: "한국어 설명",
        type: "feedback",
        body: "본문 내용\n",
      };
      const result = serializeMemory(entry);
      expect(result).toContain("name: 피드백");
      expect(result).toContain("본문 내용");
    });
  });

  describe("listMemoryDir", () => {
    it("lists all .md memory files in directory", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "mem1.md"),
        "---\nname: mem1\ndescription: First\ntype: user\n---\n\nBody 1\n"
      );
      fs.writeFileSync(
        path.join(tmpDir, "mem2.md"),
        "---\nname: mem2\ndescription: Second\ntype: feedback\n---\n\nBody 2\n"
      );

      const entries = await listMemoryDir(tmpDir);
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.name).sort()).toEqual(["mem1", "mem2"]);
    });

    it("returns empty array for empty directory", async () => {
      const entries = await listMemoryDir(tmpDir);
      expect(entries).toEqual([]);
    });

    it("ignores non-.md files", async () => {
      fs.writeFileSync(path.join(tmpDir, "notes.txt"), "not a memory");
      fs.writeFileSync(
        path.join(tmpDir, "real.md"),
        "---\nname: real\ndescription: Real one\ntype: user\n---\n\nBody\n"
      );

      const entries = await listMemoryDir(tmpDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe("real");
    });

    it("returns empty array for non-existent directory", async () => {
      const entries = await listMemoryDir(path.join(tmpDir, "nope"));
      expect(entries).toEqual([]);
    });

    it("skips files without valid frontmatter", async () => {
      fs.writeFileSync(path.join(tmpDir, "bad.md"), "No frontmatter here");
      fs.writeFileSync(
        path.join(tmpDir, "good.md"),
        "---\nname: good\ndescription: Valid\ntype: reference\n---\n\nBody\n"
      );

      const entries = await listMemoryDir(tmpDir);
      expect(entries).toHaveLength(1);
    });
  });

  describe("roundtrip", () => {
    it("serialize → write → parse produces same entry", async () => {
      const original: MemoryEntry = {
        name: "roundtrip-test",
        description: "Testing roundtrip",
        type: "project",
        body: "Original body content.\n\nWith multiple lines.\n",
      };

      const serialized = serializeMemory(original);
      const filePath = path.join(tmpDir, "roundtrip.md");
      fs.writeFileSync(filePath, serialized);

      const parsed = await parseMemory(filePath);
      expect(parsed!.name).toBe(original.name);
      expect(parsed!.description).toBe(original.description);
      expect(parsed!.type).toBe(original.type);
      expect(parsed!.body).toBe(original.body);
    });
  });
});
