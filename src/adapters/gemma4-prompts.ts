import type {
  ClassifyTicketInput,
  VerifyCompletionInput,
  DiagnoseStalledInput,
  FindDuplicatesInput,
  SummarizeAttachmentsInput,
  BoardNarrativeInput,
} from "../types.js";

export const classifyTicketPrompt = (input: ClassifyTicketInput): string => `
You are a ticket classifier for a developer's task system.
Given a natural-language task request, produce structured JSON.

Request:
${input.request}

${input.projectHint ? `Project context: ${input.projectHint}\n` : ""}
Respond with JSON ONLY in this exact shape (no prose, no markdown fences):
{
  "task_type": "구현" | "리서치" | "문서" | "리뷰",
  "priority": "high" | "med" | "low",
  "completion_criteria": [string, ...],
  "summary": string
}

Rules:
- task_type values are Korean. Use them verbatim.
- completion_criteria: 1-5 concrete checklist items. Korean OK.
- summary: one sentence, Korean OK.
- If unclear, err on task_type="구현", priority="med".
`.trim();

export const verifyCompletionPrompt = (input: VerifyCompletionInput): string => `
You decide whether a ticket can be marked "done".

Ticket body:
${input.ticketBody}

Completion criteria:
${input.completionCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

${input.recentActivity ? `Recent activity:\n${input.recentActivity}\n` : ""}
Respond with JSON ONLY:
{
  "completed": true | false,
  "missing": [string, ...],
  "rationale": string
}

Rules:
- completed=true only if every criterion has clear evidence in body or activity.
- missing lists criteria lacking evidence (verbatim text). Empty array if completed.
- rationale: one sentence in Korean.
`.trim();

export const diagnoseStalledPrompt = (input: DiagnoseStalledInput): string => `
A ticket has been stalled since ${input.stalledSince}. Classify why.

Ticket body:
${input.ticketBody}

${input.recentActivity ? `Recent activity:\n${input.recentActivity}\n` : ""}
Respond with JSON ONLY:
{
  "reason": "blocked" | "deprioritized" | "abandoned",
  "rationale": string
}

Definitions:
- blocked: waiting on external factor (dependency, review, resource).
- deprioritized: lower priority but still valid; will resume later.
- abandoned: no longer relevant; should be closed or archived.

rationale: one sentence in Korean citing specific evidence.
`.trim();

export const findDuplicatesPrompt = (input: FindDuplicatesInput): string => `
You detect duplicate tickets by meaning, not exact wording.

New ticket draft summary:
${input.draftSummary}

Existing ticket candidates:
${input.candidates.map((c) => `- ${c.task_id}: ${c.summary}`).join("\n")}

Respond with JSON ONLY:
{
  "matches": [
    { "task_id": string, "similarity": number, "reason": string }
  ]
}

Rules:
- similarity: 0.0 to 1.0. Only include matches >= 0.6.
- reason: one-line Korean explanation of overlap.
- Empty matches array is valid. Do NOT invent task_ids.
`.trim();

export const summarizeAttachmentsPrompt = (
  input: SummarizeAttachmentsInput
): string => `
Summarize the attachments of a ticket into a single markdown digest.

Ticket summary:
${input.taskSummary}

Attachments (truncate long ones):
${input.attachments
  .map(
    (a) => `### ${a.type}: ${a.path}\n${a.content.slice(0, 2000)}${a.content.length > 2000 ? "\n...(truncated)" : ""}`
  )
  .join("\n\n")}

Respond with JSON ONLY:
{
  "summary": string
}

Rules:
- summary: markdown body, 3-7 sentences in Korean.
- Extract: key decisions, unresolved questions, concrete next actions.
- Do NOT repeat the ticket summary verbatim.
`.trim();

export const boardNarrativePrompt = (input: BoardNarrativeInput): string => `
Write a concise weekly narrative for a project board.

Week: ${input.weekRange.start} ~ ${input.weekRange.end}

Status transitions this week:
${input.statusTransitions.length > 0 ? input.statusTransitions.map((t) => `- ${t}`).join("\n") : "(none)"}

Completed this week:
${input.completedTickets.length > 0 ? input.completedTickets.map((t) => `- ${t}`).join("\n") : "(none)"}

Currently stalled:
${input.stalledTickets.length > 0 ? input.stalledTickets.map((t) => `- ${t}`).join("\n") : "(none)"}

Respond with JSON ONLY:
{
  "narrative": string
}

Rules:
- narrative: Korean markdown, 3-5 sentences.
- Highlight momentum shifts and risks.
- No headers, no lists. Prose only.
`.trim();
