import { describe, it, expect } from "vitest";
import { getRepoState } from "../../src/utils/git.js";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

describe("git utils", () => {
  it("reads repo state from a git directory", async () => {
    const state = await getRepoState(repoRoot);
    expect(state).not.toBeNull();
    expect(state!.branch).toBeTruthy();
    expect(typeof state!.dirty).toBe("boolean");
    expect(typeof state!.uncommitted_files).toBe("number");
  });

  it("returns null for non-git directory", async () => {
    const state = await getRepoState(os.tmpdir());
    expect(state).toBeNull();
  });
});
