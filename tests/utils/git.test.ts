import { describe, it, expect } from "vitest";
import { getRepoState } from "../../src/utils/git.js";
import * as os from "node:os";

describe("git utils", () => {
  it("reads repo state from a git directory", async () => {
    // Use this project's own repo as test subject
    const state = await getRepoState("C:/Dev/personal/retriever");
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
