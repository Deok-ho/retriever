#!/usr/bin/env node
/**
 * Seed Retriever Hub DB with pilot projects and tickets from v2 vault bundles.
 *
 * Usage:
 *   RTV_HUB_DIR=/tmp/rtv-hub-demo node scripts/seed-hub.mjs
 */

import { HubService } from "../dist/hub/service.js";
import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";

const VAULT_CODING = "/Users/theco/Documents/MyArchive_Online/20_Resource/개인작업물_Coding";

const hub = new HubService();

// === 1. Projects ===
const projects = [
  {
    project_id: "retriever",
    status: "active",
    health: "green",
    priority: "high",
    phase: "phase3a",
    repo_path: "/Users/theco/dev/personal/retriever",
    harness_project: "retriever",
    purpose: "AI_자동화",
    goal: "Cross-LLM harness sync + AI 티켓팅 시스템",
    context_budget: 80000,
    next_task_id: "rtv_render_board",
  },
  {
    project_id: "wmux",
    status: "active",
    health: "yellow",
    priority: "high",
    phase: "phase1_mvp",
    repo_path: "C\\:\\dev\\personal\\wmux_windows-terminal-multiplexer",
    harness_project: "wmux",
    context_budget: 60000,
    next_task_id: "namedpipe_ipc",
  },
  {
    project_id: "obsidian_ai_terminal",
    status: "active",
    health: "green",
    priority: "high",
    phase: "source_map_v0_1",
    repo_path: "/Users/theco/dev/personal/obsidian-ai-terminal",
    harness_project: "obsidian-ai-terminal",
    purpose: "AI_자동화",
    goal: "Obsidian 내장 AI 터미널 + Source Map",
    context_budget: 50000,
    next_task_id: "source_map_mcp_export",
  },
];

for (const p of projects) {
  hub.projects.upsert(p);
  console.log(`✓ project: ${p.project_id}`);
}

// === 2. Pilot tickets from v2 vault ===
const ticketPaths = [
  `${VAULT_CODING}/_tasks/retriever/gemma4_adapter/ticket.md`,
  `${VAULT_CODING}/_tasks/retriever/rtv_render_board/ticket.md`,
  `${VAULT_CODING}/_tasks/wmux/namedpipe_ipc/ticket.md`,
  `${VAULT_CODING}/_tasks/obsidian_ai_terminal/source_map_mcp_export/ticket.md`,
];

function parseMd(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const fm = yaml.load(match[1]);
  const body = match[2].trim();
  return { fm, body };
}

for (const tp of ticketPaths) {
  if (!fs.existsSync(tp)) {
    console.log(`⊘ not found: ${tp}`);
    continue;
  }
  const parsed = parseMd(tp);
  if (!parsed || parsed.fm.type !== "task") continue;

  const { fm, body } = parsed;

  try {
    hub.tickets.create({
      project_id: fm.project,
      task_id: fm.task_id,
      summary: body.split("\n").find((l) => l.startsWith("## 배경") === false && l.length > 10 && !l.startsWith("#")) || fm.task_id,
      status: fm.status,
      priority: fm.priority,
      task_type: fm.task_type,
      body,
      estimated_hours: fm.estimated_hours ?? null,
      completion_criteria: fm.completion_criteria ?? [],
      context_refs: fm.context_refs ?? [],
      intake_source: "import",
    });
    console.log(`✓ ticket: ${fm.project}/${fm.task_id}`);
  } catch (err) {
    console.log(`✗ ${fm.task_id}: ${err.message}`);
  }
}

// === 3. Attach a sample external URL to one ticket ===
try {
  const att = hub.attachments.attachUrl({
    project_id: "retriever",
    task_id: "gemma4_adapter",
    url: "https://github.com/ollama/ollama/blob/main/docs/api.md",
    note: "Ollama generate API reference",
  });
  console.log(`📎 attached: ${att.attachment_id}`);
} catch (err) {
  console.log(`attach skip: ${err.message}`);
}

// === 4. Mark gemma4_adapter criteria done ===
const full = hub.tickets.readFull("retriever", "gemma4_adapter");
if (full) {
  full.completion_criteria.forEach((c) => {
    hub.tickets.setCriterionDone("retriever", "gemma4_adapter", c.idx, true);
  });
  console.log(`✓ criteria marked done: ${full.completion_criteria.length}`);
}

console.log("\n=== Seed complete ===");
hub.close();
