import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { hashFile, hashDir } from "../../src/utils/hash.js";

describe("hash utils", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-hash-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("hashes a file deterministically", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "hello");
    const hash1 = await hashFile(filePath);
    const hash2 = await hashFile(filePath);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns null for non-existent file", async () => {
    const result = await hashFile(path.join(tmpDir, "nope.txt"));
    expect(result).toBeNull();
  });

  it("hashes a directory by combining file hashes", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.md"), "aaa");
    fs.writeFileSync(path.join(tmpDir, "b.md"), "bbb");
    const result1 = await hashDir(tmpDir);
    expect(result1.hash).toMatch(/^[a-f0-9]{64}$/);

    // same content = same hash
    const result2 = await hashDir(tmpDir);
    expect(result1.hash).toBe(result2.hash);
  });

  it("counts files in directory", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.md"), "aaa");
    fs.writeFileSync(path.join(tmpDir, "b.md"), "bbb");
    const result = await hashDir(tmpDir, { returnCount: true });
    expect(result.count).toBe(2);
  });
});
