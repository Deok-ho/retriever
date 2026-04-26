import { describe, it, expect } from "vitest";
import { parseNote } from "../../src/vault-lint/parser.js";
import { runRules, buildResolver } from "../../src/vault-lint/rules.js";
import type { Note } from "../../src/vault-lint/types.js";

function note(p: string, text: string): Note {
  return parseNote({
    path: p,
    bytes: Buffer.from(text, "utf-8"),
    mtime: 0,
  });
}

describe("rules", () => {
  it("fm/required flags missing summary/tags/updated", () => {
    const notes = [note("A.md", "# A\n\nbody")];
    const v = runRules(notes, new Set(["fm/required"]));
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("fm/required");
    expect(v[0].message).toMatch(/frontmatter 가 없습니다/);
  });

  it("fm/required passes when all keys present", () => {
    const notes = [
      note(
        "A.md",
        `---\nsummary: ok\ntags: [x]\nupdated: 2026-04-24\n---\n\n# A\n`
      ),
    ];
    const v = runRules(notes, new Set(["fm/required"]));
    expect(v).toEqual([]);
  });

  it("fm/required lists individually missing keys", () => {
    const notes = [
      note("A.md", `---\nsummary: ok\n---\n\n# A`),
    ];
    const v = runRules(notes, new Set(["fm/required"]));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("tags");
    expect(v[0].message).toContain("updated");
    expect(v[0].message).not.toContain("summary");
  });

  it("fm/tags-array flags string tags", () => {
    const notes = [
      note(
        "A.md",
        `---\nsummary: x\ntags: "foo, bar"\nupdated: 2026-04-24\n---\n\n# A`
      ),
    ];
    const v = runRules(notes, new Set(["fm/tags-array"]));
    expect(v).toHaveLength(1);
    expect(v[0].autoApplyEligible).toBe(true);
  });

  it("fm/updated-format flags non-ISO date", () => {
    const notes = [
      note(
        "A.md",
        `---\nsummary: x\ntags: [t]\nupdated: 2026/04/24\n---\n\n# A`
      ),
    ];
    const v = runRules(notes, new Set(["fm/updated-format"]));
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("fm/updated-format");
  });

  it("fm/updated-format accepts ISO datetime", () => {
    const notes = [
      note(
        "A.md",
        `---\nsummary: x\ntags: [t]\nupdated: 2026-04-24T03:00:00Z\n---\n\n# A`
      ),
    ];
    const v = runRules(notes, new Set(["fm/updated-format"]));
    expect(v).toEqual([]);
  });

  it("link/broken flags unresolved wikilinks", () => {
    const notes = [
      note("A.md", "see [[Missing]] and [[Real]]"),
      note("Real.md", "# Real"),
    ];
    const v = runRules(notes, new Set(["link/broken"]));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("Missing");
  });

  it("link/broken emits link/ambiguous when basename matches multiple", () => {
    const notes = [
      note("a/Foo.md", "# Foo"),
      note("b/Foo.md", "# Foo"),
      note("Index.md", "[[Foo]]"),
    ];
    const v = runRules(notes, new Set(["link/broken"]));
    const ids = v.map((x) => x.ruleId);
    expect(ids).toContain("link/ambiguous");
  });

  it("note/orphan flags notes with no inbound links", () => {
    const notes = [
      note("Hub.md", "[[Linked]]"),
      note("Linked.md", "# Linked"),
      note("Orphan.md", "# Orphan"),
    ];
    const v = runRules(notes, new Set(["note/orphan"]));
    const orphans = v.filter((x) => x.ruleId === "note/orphan").map((x) => x.path);
    expect(orphans.sort()).toEqual(["Hub.md", "Orphan.md"]);
  });

  it("note/h1-mismatch flags H1 differing from filename", () => {
    const notes = [
      note("Foo.md", "# Bar\n\nbody"),
      note("Same.md", "# Same\n\nbody"),
    ];
    const v = runRules(notes, new Set(["note/h1-mismatch"]));
    expect(v).toHaveLength(1);
    expect(v[0].path).toBe("Foo.md");
  });

  it("severity overrides apply", () => {
    const notes = [note("A.md", "# A")];
    const v = runRules(
      notes,
      new Set(["fm/required"]),
      new Map([["fm/required", "warn"]])
    );
    expect(v[0].severity).toBe("warn");
  });
});

describe("buildResolver", () => {
  it("resolves by full relative path", () => {
    const notes = [
      note("Folder/Foo.md", ""),
      note("Other.md", ""),
    ];
    const resolve = buildResolver(notes);
    expect(resolve("Folder/Foo")).toBe("Folder/Foo.md");
    expect(resolve("Folder/Foo.md")).toBe("Folder/Foo.md");
  });

  it("resolves by basename when unique", () => {
    const notes = [note("a/b/Foo.md", "")];
    const resolve = buildResolver(notes);
    expect(resolve("Foo")).toBe("a/b/Foo.md");
  });

  it("returns ambiguous for multiple matches", () => {
    const notes = [note("a/Foo.md", ""), note("b/Foo.md", "")];
    const resolve = buildResolver(notes);
    expect(resolve("Foo")).toBe("ambiguous");
  });

  it("returns null for missing target", () => {
    const resolve = buildResolver([note("X.md", "")]);
    expect(resolve("Nope")).toBeNull();
  });
});
