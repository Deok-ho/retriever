import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Extract the two pure helpers (rtvEstimateRowHeight + rtvBinarySearchOffset).
// They live at the bottom of retriever-session-chat.jsx and have no JSX.
const src = fs.readFileSync(
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "web", "retriever-session-chat.jsx"),
  "utf8"
);

const heightStart = src.indexOf("function rtvEstimateRowHeight");
const heightEnd = src.indexOf("if (typeof window !== \"undefined\") window.rtvEstimateRowHeight");
const heightSrc = src.slice(heightStart, heightEnd) +
  "if (typeof window !== \"undefined\") window.rtvEstimateRowHeight = rtvEstimateRowHeight;";

const bsStart = src.indexOf("function rtvBinarySearchOffset");
const bsEnd = src.indexOf("if (typeof window !== \"undefined\") window.rtvBinarySearchOffset");
const bsSrc = src.slice(bsStart, bsEnd) +
  "if (typeof window !== \"undefined\") window.rtvBinarySearchOffset = rtvBinarySearchOffset;";

const ctx: { window?: {
  rtvEstimateRowHeight?: (m: unknown) => number;
  rtvBinarySearchOffset?: (offsets: number[], target: number) => number;
} } = { window: {} };

new Function("window", heightSrc + "\n" + bsSrc)(ctx.window);
const estimate = ctx.window!.rtvEstimateRowHeight!;
const binSearch = ctx.window!.rtvBinarySearchOffset!;

describe("virtual scroll helpers (Codex 주의급 #10)", () => {
  describe("rtvEstimateRowHeight", () => {
    test("default for null/undefined", () => {
      expect(estimate(null)).toBe(80);
      expect(estimate(undefined)).toBe(80);
    });
    test("thinking is shorter than default", () => {
      expect(estimate({ kind: "thinking", text: "x" })).toBe(60);
    });
    test("tool collapsed is shorter than default", () => {
      expect(estimate({ kind: "tool", tool: "Bash", args: "ls" })).toBe(56);
    });
    test("user/assistant base is 80px for short text", () => {
      expect(estimate({ kind: "user", text: "hi" })).toBe(80);
      expect(estimate({ kind: "assistant", text: "ok" })).toBe(80);
    });
    test("multi-line text increases height", () => {
      const tall = estimate({ kind: "user", text: "a\nb\nc\nd\ne" });
      expect(tall).toBeGreaterThan(80);
    });
    test("long text increases height", () => {
      const big = estimate({ kind: "assistant", text: "x".repeat(800) });
      expect(big).toBeGreaterThan(80);
    });
    test("ceiling on very long text (no unbounded growth)", () => {
      const huge = estimate({ kind: "assistant", text: "x".repeat(100_000) });
      expect(huge).toBeLessThanOrEqual(80 + 30 * 18);
    });
  });

  describe("rtvBinarySearchOffset", () => {
    // offsets[0] = 0; offsets[i+1] = bottom of row i
    const offsets = [0, 100, 200, 300, 400, 500];

    test("target=0 → row 0", () => {
      expect(binSearch(offsets, 0)).toBe(0);
    });
    test("target inside row 1 → 1", () => {
      expect(binSearch(offsets, 150)).toBe(1);
    });
    test("target on boundary → next row", () => {
      // offsets[2]=200 means row 2 starts at y=200, so y=200 is row 2
      expect(binSearch(offsets, 200)).toBe(2);
    });
    test("target beyond last row → returns last index (clamped)", () => {
      const r = binSearch(offsets, 9999);
      expect(r).toBe(offsets.length - 1);
    });
    test("monotone target → monotone result on 100-row scan", () => {
      const big = [0];
      for (let i = 1; i <= 1000; i++) big.push(big[i - 1] + 100);
      let prev = -1;
      for (let y = 0; y < 1000 * 100; y += 5000) {
        const idx = binSearch(big, y);
        expect(idx).toBeGreaterThanOrEqual(prev);
        prev = idx;
      }
    });
  });
});
