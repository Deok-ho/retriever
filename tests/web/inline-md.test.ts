import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Load the chat module via Function ctor with a window stub. Strip JSX-only
// pieces (renderRichText/ChatTurn/SessionChat) by extracting just our tokenizer
// helper. We feed the whole file but isolate the export through window.
const src = fs.readFileSync(
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "web", "retriever-session-chat.jsx"),
  "utf8"
);

// Pull out only the helper functions we want to test — they live below the
// JSX components but use plain JS regexes / arrays (no React).
const helperSrc = (() => {
  const start = src.indexOf("function rtvTokenizeInlineMd");
  // End at the line *after* the window assignment (line 320 in source).
  const winLine = "if (typeof window !== \"undefined\") window.rtvTokenizeInlineMd = rtvTokenizeInlineMd;";
  const end = src.indexOf(winLine);
  if (start < 0 || end < 0) throw new Error("could not locate helpers");
  return src.slice(start, end + winLine.length);
})();

const ctx: { window?: { rtvTokenizeInlineMd?: (s: string) => unknown[] } } = { window: {} };
new Function("window", helperSrc)(ctx.window);
const tokenize = ctx.window!.rtvTokenizeInlineMd as (s: string) => Array<{ kind: string; value: string; url?: string }>;

describe("inline markdown tokenizer (Codex 주의급 #8)", () => {
  test("plain text passes through as a single text token", () => {
    expect(tokenize("hello world")).toEqual([
      { kind: "text", value: "hello world" },
    ]);
  });

  test("inline `code` is recognized", () => {
    const ts = tokenize("set `RTV_HUB_TOKEN` first");
    expect(ts).toEqual([
      { kind: "text", value: "set " },
      { kind: "code", value: "RTV_HUB_TOKEN" },
      { kind: "text", value: " first" },
    ]);
  });

  test("**bold** is recognized", () => {
    const ts = tokenize("**중요** 사항");
    expect(ts).toEqual([
      { kind: "bold", value: "중요" },
      { kind: "text", value: " 사항" },
    ]);
  });

  test("[text](url) link with http(s) only", () => {
    const ts = tokenize("see [docs](https://example.com/path) for details");
    expect(ts[1]).toEqual({ kind: "link", value: "docs", url: "https://example.com/path" });
  });

  test("does not match javascript: scheme as link (security)", () => {
    const ts = tokenize("[bad](javascript:alert(1))");
    // The whole thing should remain text — our regex only allows http/https
    expect(ts.find((t) => t.kind === "link")).toBeUndefined();
  });

  test("does not match single-asterisk italic (Korean/bullet false-match guard)", () => {
    const ts = tokenize("*hello* world");
    expect(ts.every((t) => t.kind === "text")).toBe(true);
  });

  test("mix of code + bold + link in single string", () => {
    const ts = tokenize("**경로**: `~/.claude` — [home](https://x)");
    const kinds = ts.map((t) => t.kind);
    expect(kinds).toEqual(["bold", "text", "code", "text", "link"]);
  });

  test("backtick across newline does not match (paragraph safety)", () => {
    const ts = tokenize("hi `multi\nline` end");
    expect(ts.every((t) => t.kind === "text")).toBe(true);
  });

  test("empty input returns []", () => {
    expect(tokenize("")).toEqual([]);
  });
});
