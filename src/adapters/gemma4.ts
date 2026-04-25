import type {
  Gemma4Config,
  Gemma4Result,
  ClassifyTicketInput,
  ClassifyTicketOutput,
  VerifyCompletionInput,
  VerifyCompletionOutput,
  DiagnoseStalledInput,
  DiagnoseStalledOutput,
  FindDuplicatesInput,
  FindDuplicatesOutput,
  SummarizeAttachmentsInput,
  SummarizeAttachmentsOutput,
  BoardNarrativeInput,
  BoardNarrativeOutput,
  TaskType,
  Priority,
} from "../types.js";
import {
  classifyTicketPrompt,
  verifyCompletionPrompt,
  diagnoseStalledPrompt,
  findDuplicatesPrompt,
  summarizeAttachmentsPrompt,
  boardNarrativePrompt,
} from "./gemma4-prompts.js";

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: false;
  format: "json";
  options: { temperature: number };
}

interface OllamaGenerateResponse {
  response: string;
}

const VALID_TASK_TYPES: readonly TaskType[] = ["구현", "리서치", "문서", "리뷰"];
const VALID_PRIORITIES: readonly Priority[] = ["high", "med", "low"];

export class Gemma4Adapter {
  constructor(private config: Gemma4Config) {}

  async classifyTicket(
    input: ClassifyTicketInput
  ): Promise<Gemma4Result<ClassifyTicketOutput>> {
    return this.run(classifyTicketPrompt(input), 0.2, (parsed) => {
      if (!VALID_TASK_TYPES.includes(parsed.task_type)) {
        throw new Error(`invalid task_type: ${parsed.task_type}`);
      }
      if (!VALID_PRIORITIES.includes(parsed.priority)) {
        throw new Error(`invalid priority: ${parsed.priority}`);
      }
      if (!Array.isArray(parsed.completion_criteria)) {
        throw new Error("completion_criteria must be array");
      }
      if (typeof parsed.summary !== "string" || parsed.summary.length === 0) {
        throw new Error("summary must be non-empty string");
      }
      return {
        task_type: parsed.task_type as TaskType,
        priority: parsed.priority as Priority,
        completion_criteria: parsed.completion_criteria.map(String),
        summary: parsed.summary,
      };
    });
  }

  async verifyCompletion(
    input: VerifyCompletionInput
  ): Promise<Gemma4Result<VerifyCompletionOutput>> {
    return this.run(verifyCompletionPrompt(input), 0.1, (parsed) => {
      if (typeof parsed.completed !== "boolean") {
        throw new Error("completed must be boolean");
      }
      if (!Array.isArray(parsed.missing)) {
        throw new Error("missing must be array");
      }
      return {
        completed: parsed.completed,
        missing: parsed.missing.map(String),
        rationale: String(parsed.rationale ?? ""),
      };
    });
  }

  async diagnoseStalled(
    input: DiagnoseStalledInput
  ): Promise<Gemma4Result<DiagnoseStalledOutput>> {
    const validReasons = ["blocked", "deprioritized", "abandoned"] as const;
    return this.run(diagnoseStalledPrompt(input), 0.2, (parsed) => {
      if (!validReasons.includes(parsed.reason)) {
        throw new Error(`invalid reason: ${parsed.reason}`);
      }
      return {
        reason: parsed.reason,
        rationale: String(parsed.rationale ?? ""),
      };
    });
  }

  async findDuplicates(
    input: FindDuplicatesInput
  ): Promise<Gemma4Result<FindDuplicatesOutput>> {
    const candidateIds = new Set(input.candidates.map((c) => c.task_id));
    return this.run(findDuplicatesPrompt(input), 0.2, (parsed) => {
      if (!Array.isArray(parsed.matches)) {
        throw new Error("matches must be array");
      }
      const matches = parsed.matches
        .filter(
          (m: { task_id?: unknown; similarity?: unknown }) =>
            typeof m.task_id === "string" &&
            candidateIds.has(m.task_id) &&
            typeof m.similarity === "number"
        )
        .map((m: { task_id: string; similarity: number; reason?: string }) => ({
          task_id: m.task_id,
          similarity: Math.max(0, Math.min(1, m.similarity)),
          reason: String(m.reason ?? ""),
        }));
      return { matches };
    });
  }

  async summarizeAttachments(
    input: SummarizeAttachmentsInput
  ): Promise<Gemma4Result<SummarizeAttachmentsOutput>> {
    return this.run(summarizeAttachmentsPrompt(input), 0.4, (parsed) => {
      if (typeof parsed.summary !== "string" || parsed.summary.length === 0) {
        throw new Error("summary must be non-empty string");
      }
      return { summary: parsed.summary };
    });
  }

  async renderBoardNarrative(
    input: BoardNarrativeInput
  ): Promise<Gemma4Result<BoardNarrativeOutput>> {
    return this.run(boardNarrativePrompt(input), 0.5, (parsed) => {
      if (typeof parsed.narrative !== "string" || parsed.narrative.length === 0) {
        throw new Error("narrative must be non-empty string");
      }
      return { narrative: parsed.narrative };
    });
  }

  private async run<T>(
    prompt: string,
    temperature: number,
    validate: (parsed: any) => T
  ): Promise<Gemma4Result<T>> {
    if (!this.config.enabled) {
      return { ok: false, error: "gemma4 adapter disabled" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const body: OllamaGenerateRequest = {
        model: this.config.model,
        prompt,
        stream: false,
        format: "json",
        options: { temperature },
      };
      const response = await fetch(`${this.config.url}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        return { ok: false, error: `ollama http ${response.status}` };
      }
      const data = (await response.json()) as OllamaGenerateResponse;
      const raw = data.response ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false, error: `invalid json from model: ${raw.slice(0, 200)}` };
      }
      try {
        const validated = validate(parsed);
        return { ok: true, data: validated, raw };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `validation failed: ${msg}` };
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: `timeout after ${this.config.timeoutMs}ms` };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `fetch failed: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  }
}
