import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readYaml, writeYaml } from "../../src/utils/yaml.js";

describe("yaml utils", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-yaml-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes and reads yaml with UTF-8 korean", async () => {
    const data = { project: { name: "테스트" }, tags: ["한국어"] };
    const filePath = path.join(tmpDir, "test.yaml");
    await writeYaml(filePath, data);
    const result = await readYaml(filePath);
    expect(result).toEqual(data);
  });

  it("returns null for non-existent file", async () => {
    const result = await readYaml(path.join(tmpDir, "nope.yaml"));
    expect(result).toBeNull();
  });

  it("creates parent directories if needed", async () => {
    const filePath = path.join(tmpDir, "deep", "nested", "file.yaml");
    await writeYaml(filePath, { ok: true });
    const result = await readYaml(filePath);
    expect(result).toEqual({ ok: true });
  });
});
