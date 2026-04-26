#!/usr/bin/env node
/**
 * Docker hub smoke test.
 *
 * Exercises the v3 deployment:
 *   1. HTTP MCP round-trip (host → containerized hub)
 *   2. SQLite persistence across container restart
 *   3. /healthz liveness endpoint
 *
 * Assumes the hub container is running and reachable at RTV_HUB_URL.
 *
 * Usage:
 *   node scripts/smoke-docker.mjs              # populate + verify
 *   node scripts/smoke-docker.mjs --verify     # verify only (after restart)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const HUB_URL = process.env.RTV_HUB_URL ?? "http://127.0.0.1:8731/mcp";
const HEALTHZ_URL = HUB_URL.replace(/\/mcp\/?$/, "/healthz");
const verifyOnly = process.argv.includes("--verify");

const PROJECT_ID = "smoke";
const TASK_ID = "docker_persistence";
const TASK_SUMMARY = "Verify SQLite survives container restart";

function log(...args) {
  console.log("[smoke-docker]", ...args);
}

function fail(msg) {
  console.error("[smoke-docker] FAIL:", msg);
  process.exit(1);
}

async function waitForHealthz(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(HEALTHZ_URL);
      if (r.ok) {
        const body = await r.json();
        if (body.ok === true) return;
      }
    } catch {
      /* not ready yet */
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  fail(`hub /healthz not ready within ${timeoutMs}ms (${HEALTHZ_URL})`);
}

async function callTool(client, name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return { isError: r.isError === true, text };
}

async function main() {
  log(`hub: ${HUB_URL}`);
  log(`mode: ${verifyOnly ? "verify-only" : "populate + verify"}`);

  await waitForHealthz();
  log("healthz: ok");

  const transport = new StreamableHTTPClientTransport(new URL(HUB_URL));
  const client = new Client(
    { name: "rtv-smoke-docker", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  log("connected via Streamable HTTP");

  // Sanity: tools list must include hub tools
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  for (const required of ["rtv_list_projects", "rtv_create_ticket", "rtv_list_tickets"]) {
    if (!names.includes(required)) fail(`missing tool: ${required}`);
  }
  log(`tools: ${tools.tools.length} registered (hub-side)`);

  if (!verifyOnly) {
    // Populate phase
    const upsert = await callTool(client, "rtv_upsert_project", {
      project_id: PROJECT_ID,
      status: "active",
      priority: "high",
      purpose: "validation",
      goal: "prove docker deployment",
    });
    if (upsert.isError) fail(`upsert failed: ${upsert.text}`);
    log(`project upserted: ${upsert.text}`);

    const create = await callTool(client, "rtv_create_ticket", {
      project_id: PROJECT_ID,
      task_id: TASK_ID,
      summary: TASK_SUMMARY,
      priority: "high",
      task_type: "리서치",
      completion_criteria: ["container restart preserves data"],
    });
    if (create.isError) fail(`create_ticket failed: ${create.text}`);
    log(`ticket created: ${create.text}`);
  }

  // Verify phase (always runs)
  const list = await callTool(client, "rtv_list_tickets", {
    project_id: PROJECT_ID,
  });
  if (list.isError) fail(`list_tickets failed: ${list.text}`);
  if (!list.text.includes(`${PROJECT_ID}/${TASK_ID}`)) {
    fail(`expected ticket ${PROJECT_ID}/${TASK_ID} in list, got:\n${list.text}`);
  }
  log(`verified: ${PROJECT_ID}/${TASK_ID} present in list_tickets`);

  const read = await callTool(client, "rtv_read_ticket", {
    project_id: PROJECT_ID,
    task_id: TASK_ID,
  });
  if (read.isError) fail(`read_ticket failed: ${read.text}`);
  if (!read.text.includes(TASK_SUMMARY)) {
    fail(`expected summary "${TASK_SUMMARY}" in read result, got:\n${read.text}`);
  }
  log(`verified: ticket body intact (summary matches)`);

  await client.close();
  log("PASS");
}

main().catch((err) => {
  console.error("[smoke-docker] error:", err);
  process.exit(1);
});
