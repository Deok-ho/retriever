import { describe, it, expect } from "vitest";
import { parseNote } from "../../src/vault-lint/parser.js";

function parse(text: string, p = "Note.md") {
  return parseNote({
    path: p,
    bytes: Buffer.from(text, "utf-8"),
    mtime: 0,
  });
}

describe("parseNote", () => {
  it("parses frontmatter, body, h1", () => {
    const note = parse(
      `---\nsummary: hello\ntags: [a, b]\nupdated: 2026-04-24\n---\n\n# 제목\n\n본문\n`
    );
    expect(note.frontmatter).toMatchObject({
      summary: "hello",
      tags: ["a", "b"],
    });
    expect(note.h1).toBe("제목");
    expect(note.tags.sort()).toEqual(["a", "b"]);
  });

  it("returns null frontmatter when missing", () => {
    const note = parse("# Title\n\nbody");
    expect(note.frontmatter).toBeNull();
    expect(note.h1).toBe("Title");
  });

  it("extracts wikilinks with alias and section", () => {
    const note = parse("see [[Foo]], [[Bar|alias]], [[Baz#sec]]");
    expect(note.wikilinks).toEqual([
      { target: "Foo", alias: null, section: null },
      { target: "Bar", alias: "alias", section: null },
      { target: "Baz", alias: null, section: "sec" },
    ]);
  });

  it("ignores wikilinks inside code fences and inline code", () => {
    const note = parse(
      "```\n[[InsideFence]]\n```\n\n`[[InsideInline]]`\n\n[[Real]]"
    );
    expect(note.wikilinks.map((w) => w.target)).toEqual(["Real"]);
  });

  it("extracts inline tags including hangul", () => {
    const note = parse("hello #ai 그리고 #한국어 끝");
    expect(note.tags.sort()).toEqual(["ai", "한국어"]);
  });

  it("merges frontmatter tags with inline tags", () => {
    const note = parse(`---\ntags: [foo, bar]\n---\n\n#baz body`);
    expect(note.tags.sort()).toEqual(["bar", "baz", "foo"]);
  });

  it("accepts string-form tags in frontmatter", () => {
    const note = parse(`---\ntags: "alpha, beta"\n---\n\nbody`);
    expect(note.tags.sort()).toEqual(["alpha", "beta"]);
  });

  it("hash is stable for identical bytes", () => {
    const a = parse("---\ntitle: x\n---\nbody");
    const b = parse("---\ntitle: x\n---\nbody");
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("survives invalid yaml frontmatter without throwing", () => {
    const note = parse("---\n: : :\n---\n\nbody");
    expect(note.frontmatter).toBeNull();
    expect(note.body).toContain("body");
  });

  it("does not treat anchor-only links as tags", () => {
    const note = parse("see #section-anchor inside paren (#paren)");
    expect(note.tags.sort()).toEqual(["paren", "section-anchor"]);
  });
});
