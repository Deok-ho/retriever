#!/usr/bin/env node
/**
 * Hub MVP 데모 — 툴 핸들러 직접 호출로 동작 확인.
 *
 *   RTV_HUB_DIR=/tmp/rtv-hub-demo node scripts/demo-hub.mjs
 */

import { HubService } from "../dist/hub/service.js";
import * as tools from "../dist/hub/tools.js";

const hub = new HubService();

function h(title) {
  const pad = Math.max(3, 72 - title.length);
  console.log(`\n━━━ ${title} ${"━".repeat(pad)}\n`);
}

h("rtv_list_projects");
console.log(tools.listProjects(hub));

h("rtv_list_tickets — 전체");
console.log(tools.listTickets(hub, {}));

h("rtv_list_tickets — status=in_progress");
console.log(tools.listTickets(hub, { status: "in_progress" }));

h("rtv_list_tickets — project=retriever, priority=high");
console.log(tools.listTickets(hub, { project_id: "retriever", priority: "high" }));

h("rtv_read_ticket — retriever/gemma4_adapter");
console.log(tools.readTicket(hub, "retriever", "gemma4_adapter"));

h("rtv_complete_ticket — retriever/gemma4_adapter (4/4 criteria done)");
console.log(tools.completeTicket(hub, "retriever", "gemma4_adapter", "Ollama format=json + validator 패턴이 핵심"));

h("rtv_complete_ticket — wmux/namedpipe_ipc (criteria 미충족)");
console.log(tools.completeTicket(hub, "wmux", "namedpipe_ipc", null));

h("rtv_classify_ticket — 자연어 intake (Gemma4 live)");
const classified = await tools.classifyTicket(
  hub,
  "drag drop 지원 추가",
  "retriever"
);
console.log(classified);

h("rtv_read_ticket — retriever/gemma4_adapter (완료 후)");
console.log(tools.readTicket(hub, "retriever", "gemma4_adapter"));

hub.close();
console.log("\n=== Demo complete ===");
