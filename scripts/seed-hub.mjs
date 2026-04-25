#!/usr/bin/env node
/**
 * Seed Retriever Hub DB from a config file.
 *
 * Config resolution order:
 *   1. RTV_SEED_CONFIG env (absolute path to JSON)
 *   2. scripts/local/seed-config.json (gitignored, personal data)
 *   3. scripts/seed-config.example.json (public template — read-only example)
 *
 * Usage:
 *   RTV_HUB_DIR=/tmp/rtv-hub-demo node scripts/seed-hub.mjs
 *   RTV_SEED_CONFIG=/path/to/your.json node scripts/seed-hub.mjs
 *
 * Config schema: see scripts/seed-config.example.json
 */

import { HubService } from "../dist/hub/service.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveConfigPath() {
  if (process.env.RTV_SEED_CONFIG) return process.env.RTV_SEED_CONFIG;
  const localPath = path.join(__dirname, "local", "seed-config.json");
  if (fs.existsSync(localPath)) return localPath;
  const examplePath = path.join(__dirname, "seed-config.example.json");
  if (fs.existsSync(examplePath)) {
    console.error(
      "[seed-hub] No personal config found. Falling back to example template.",
    );
    console.error(
      "          Copy scripts/seed-config.example.json → scripts/local/seed-config.json and edit.",
    );
    return examplePath;
  }
  throw new Error(
    "No seed config found. Set RTV_SEED_CONFIG or create scripts/local/seed-config.json",
  );
}

const configPath = resolveConfigPath();
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const {
  vault_coding,
  projects = [],
  ticket_relpaths = [],
  ticket_paths = [],
  attachments = [],
  mark_criteria_done = [],
} = config;

const hub = new HubService();

// === 1. Projects ===
for (const p of projects) {
  hub.projects.upsert(p);
  console.log(`✓ project: ${p.project_id}`);
}

// === 2. Pilot tickets (resolved from vault_coding + relpaths, or absolute paths) ===
function parseMd(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const fm = yaml.load(match[1]);
  const body = match[2].trim();
  return { fm, body };
}

const resolvedTicketPaths = [
  ...ticket_paths,
  ...ticket_relpaths.map((rel) =>
    vault_coding ? path.join(vault_coding, rel) : rel,
  ),
];

for (const tp of resolvedTicketPaths) {
  if (!fs.existsSync(tp)) {
    console.log(`⊘ not found: ${tp}`);
    continue;
  }
  const parsed = parseMd(tp);
  if (!parsed || parsed.fm.type !== "task") continue;

  const { fm, body } = parsed;
  const summary =
    body
      .split("\n")
      .find(
        (l) => l.startsWith("## 배경") === false && l.length > 10 && !l.startsWith("#"),
      ) || fm.task_id;

  try {
    hub.tickets.create({
      project_id: fm.project,
      task_id: fm.task_id,
      summary,
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

// === 3. External URL attachments ===
for (const att of attachments) {
  try {
    const result = hub.attachments.attachUrl(att);
    console.log(`📎 attached: ${result.attachment_id}`);
  } catch (err) {
    console.log(`attach skip (${att.task_id}): ${err.message}`);
  }
}

// === 4. Mark all criteria of a ticket as done ===
for (const m of mark_criteria_done) {
  const full = hub.tickets.readFull(m.project_id, m.task_id);
  if (!full) {
    console.log(`mark skip: ${m.project_id}/${m.task_id} not found`);
    continue;
  }
  full.completion_criteria.forEach((c) => {
    hub.tickets.setCriterionDone(m.project_id, m.task_id, c.idx, true);
  });
  console.log(
    `✓ criteria marked done: ${m.project_id}/${m.task_id} (${full.completion_criteria.length})`,
  );
}

console.log("\n=== Seed complete ===");
hub.close();
