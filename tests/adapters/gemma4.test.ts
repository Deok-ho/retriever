import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Gemma4Adapter } from "../../src/adapters/gemma4.js";
import type { Gemma4Config } from "../../src/types.js";

const config: Gemma4Config = {
  enabled: true,
  url: "http://localhost:11434",
  model: "gemma4:test",
  timeoutMs: 5000,
};

function mockOllamaResponse(payload: unknown, opts: { ok?: boolean; status?: number } = {}) {
  const ok = opts.ok ?? true;
  const status = opts.status ?? 200;
  return {
    ok,
    status,
    json: async () => ({ response: JSON.stringify(payload) }),
  } as Response;
}

describe("Gemma4Adapter", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("classifyTicket", () => {
    it("returns structured classification on valid JSON", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({
          task_type: "구현",
          priority: "high",
          completion_criteria: ["테스트 통과", "빌드 성공"],
          summary: "Gemma4 어댑터 구현",
        })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.classifyTicket({ request: "어댑터 만들어줘" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.task_type).toBe("구현");
        expect(result.data.priority).toBe("high");
        expect(result.data.completion_criteria).toHaveLength(2);
      }
    });

    it("rejects invalid task_type", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({
          task_type: "unknown",
          priority: "high",
          completion_criteria: [],
          summary: "x",
        })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.classifyTicket({ request: "x" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("invalid task_type");
    });

    it("returns error on HTTP failure", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({}, { ok: false, status: 500 })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.classifyTicket({ request: "x" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("http 500");
    });

    it("returns error on non-JSON response", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ response: "not json at all" }),
      } as Response);
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.classifyTicket({ request: "x" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("invalid json");
    });

    it("returns error when disabled", async () => {
      const adapter = new Gemma4Adapter({ ...config, enabled: false });
      const result = await adapter.classifyTicket({ request: "x" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("disabled");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("verifyCompletion", () => {
    it("returns completion verdict", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({
          completed: false,
          missing: ["테스트 통과"],
          rationale: "테스트 실행 증거 없음",
        })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.verifyCompletion({
        ticketBody: "구현 완료",
        completionCriteria: ["테스트 통과"],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.completed).toBe(false);
        expect(result.data.missing).toEqual(["테스트 통과"]);
      }
    });
  });

  describe("diagnoseStalled", () => {
    it("classifies blocked reason", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({
          reason: "blocked",
          rationale: "외부 리뷰 대기 중",
        })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.diagnoseStalled({
        ticketBody: "PR 올림",
        stalledSince: "2026-04-20",
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.reason).toBe("blocked");
    });

    it("rejects invalid reason", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({ reason: "unknown", rationale: "x" })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.diagnoseStalled({
        ticketBody: "x",
        stalledSince: "2026-04-20",
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("findDuplicates", () => {
    it("filters by candidate list", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({
          matches: [
            { task_id: "valid_id", similarity: 0.85, reason: "유사함" },
            { task_id: "hallucinated", similarity: 0.9, reason: "가짜" },
          ],
        })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.findDuplicates({
        draftSummary: "x",
        candidates: [{ task_id: "valid_id", summary: "y" }],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.matches).toHaveLength(1);
        expect(result.data.matches[0].task_id).toBe("valid_id");
      }
    });

    it("clamps similarity to [0,1]", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({
          matches: [{ task_id: "a", similarity: 1.5, reason: "x" }],
        })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.findDuplicates({
        draftSummary: "x",
        candidates: [{ task_id: "a", summary: "y" }],
      });
      if (result.ok) expect(result.data.matches[0].similarity).toBe(1);
    });
  });

  describe("summarizeAttachments", () => {
    it("returns summary text", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({ summary: "## 주요 결정\n- 어댑터 분리" })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.summarizeAttachments({
        taskSummary: "어댑터 구현",
        attachments: [
          { type: "session", path: "a.md", content: "세션 로그 내용" },
        ],
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.summary).toContain("어댑터");
    });

    it("rejects empty summary", async () => {
      fetchSpy.mockResolvedValueOnce(mockOllamaResponse({ summary: "" }));
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.summarizeAttachments({
        taskSummary: "x",
        attachments: [],
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("renderBoardNarrative", () => {
    it("returns narrative text", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockOllamaResponse({ narrative: "이번 주 3개 완료, 1개 정체." })
      );
      const adapter = new Gemma4Adapter(config);
      const result = await adapter.renderBoardNarrative({
        weekRange: { start: "2026-04-19", end: "2026-04-25" },
        statusTransitions: ["a: todo → done"],
        stalledTickets: ["b"],
        completedTickets: ["a"],
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.narrative.length).toBeGreaterThan(0);
    });
  });

  describe("timeout", () => {
    it("returns timeout error on AbortError", async () => {
      fetchSpy.mockImplementationOnce(async (_url, init) => {
        const signal = (init as RequestInit).signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });
      const fastConfig: Gemma4Config = { ...config, timeoutMs: 10 };
      const adapter = new Gemma4Adapter(fastConfig);
      const result = await adapter.classifyTicket({ request: "x" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("timeout");
    });
  });
});
