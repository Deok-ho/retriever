// Retriever — Live data adapter (sessions read-only viewer).
// Bridges the JSON API at /api/sessions* to the UI shape used by retriever-sessions.jsx
// and retriever-session-chat.jsx. When the API is unreachable, callers fall back to
// the bundled mock fixtures so the UI still demos.

const RTV_API_BASE = "/api";

function rtvFmtIso(iso) {
  if (!iso) return "";
  // "2026-04-29T00:01:00Z" → "2026-04-29 00:01"
  return iso.replace("T", " ").replace(/\.\d+Z$/, "").replace(/Z$/, "").slice(0, 16);
}

function rtvDeriveBranch(s) {
  const machine = s.machine_id || "machine";
  let repo = "(no-repo)";
  let branch = "(no-branch)";
  if (s.cwd_at_start) {
    const segs = s.cwd_at_start.split("/").filter(Boolean);
    if (segs.length) repo = segs[segs.length - 1];
  }
  return `${branch}@${repo}@${machine}`;
}

function rtvShapeRow(s) {
  let commit_shas = [];
  try { commit_shas = JSON.parse(s.commit_shas_json || "[]"); } catch { /* keep [] */ }
  return {
    uid: s.session_uid,
    branch: rtvDeriveBranch(s),
    harness: s.harness,
    native_id: s.native_id,
    started_at: rtvFmtIso(s.started_at),
    last_active: rtvFmtIso(s.last_active_at),
    ended_at: s.ended_at ? rtvFmtIso(s.ended_at) : null,
    status: s.status,
    summary: "", // populated lazily on click via detail fetch
    bytes: s.bytes_total || 0,
    events: s.events_total || 0,
    files: [],     // populated lazily from /api/sessions/:uid?events=1
    tools: {},     // populated lazily — keep object so Object.entries() never throws
    tickets: [],   // mock-only concept (auto-link is post-MVP); empty array on live rows
    commit_shas,
    active_seconds: 0,
    errors: 0,
    goal: "",
    outcome: s.status === "active" ? "ongoing" : s.status,
    cwd: s.cwd_at_start || null,
    project_id: s.project_id || null,
    machine: s.machine_id,
    raw: s,
    live: true,
  };
}

async function rtvFetchLiveSessions(opts) {
  const params = new URLSearchParams();
  if (opts && opts.machine_id) params.set("machine_id", opts.machine_id);
  if (opts && opts.harness) params.set("harness", opts.harness);
  if (opts && opts.since) params.set("since", opts.since);
  if (opts && opts.until) params.set("until", opts.until);
  if (opts && opts.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  const url = `${RTV_API_BASE}/sessions${q ? "?" + q : ""}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = await r.json();
  return (body.sessions || []).map(rtvShapeRow);
}

async function rtvSearchLiveSessions(query, opts = {}) {
  if (!query || !query.trim()) return [];
  const params = new URLSearchParams();
  params.set("q", query);
  if (opts.machine_id) params.set("machine_id", opts.machine_id);
  if (opts.harness) params.set("harness", opts.harness);
  if (opts.limit) params.set("limit", String(opts.limit));
  const url = `${RTV_API_BASE}/sessions/search?${params}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = await r.json();
  return body.hits || []; // [{ session_uid, snippet, rank }]
}

// Build a `since` ISO from human-friendly window keyword.
function rtvSinceFromWindow(win) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const startOfKstDay = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), -9));
  switch (win) {
    case "today":     return startOfKstDay.toISOString();
    case "yesterday": return new Date(startOfKstDay.getTime() - 86400_000).toISOString();
    case "7d":        return new Date(now.getTime() - 7 * 86400_000).toISOString();
    case "30d":       return new Date(now.getTime() - 30 * 86400_000).toISOString();
    default:          return null; // "all"
  }
}

function rtvUntilFromWindow(win) {
  if (win !== "yesterday") return null;
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const startOfKstDay = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), -9));
  return startOfKstDay.toISOString();
}

async function rtvFetchDaily(opts) {
  if (!opts || !opts.since || !opts.until) throw new Error("rtvFetchDaily: missing since/until");
  const params = new URLSearchParams();
  params.set("since", opts.since);
  params.set("until", opts.until);
  if (opts.machine_id) params.set("machine_id", opts.machine_id);
  if (opts.harness) params.set("harness", opts.harness);
  if (opts.limit) params.set("limit", String(opts.limit));
  const url = `${RTV_API_BASE}/sessions/daily?${params}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

async function rtvFetchLiveSessionDetail(uid, opts = {}) {
  const params = new URLSearchParams();
  params.set("events", "1");
  if (opts.transcript) params.set("transcript", "1");
  const url = `${RTV_API_BASE}/sessions/${encodeURIComponent(uid)}?${params}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

// Build chat-turn array from normalized events for retriever-session-chat.jsx.
// Each turn carries its real ts (no interpolation) and full payload metadata.
function rtvEventsToTurns(events) {
  if (!Array.isArray(events)) return [];
  const turns = [];
  for (const ev of events) {
    let payload = {};
    try { payload = typeof ev.payload_json === "string" ? JSON.parse(ev.payload_json) : (ev.payload || {}); } catch { /* ignore */ }
    const ts = ev.ts || "";
    switch (ev.event_type) {
      case "user_msg":
        if (payload.text) turns.push({ kind: "user", text: payload.text, ts });
        break;
      case "assistant_msg":
        if (payload.text) turns.push({ kind: "assistant", text: payload.text, ts });
        break;
      case "thinking":
        if (payload.text) turns.push({ kind: "thinking", text: payload.text, ts });
        break;
      case "tool_use": {
        // Friendly arg label: command for Bash, file_path for Edit/Read/Write, else first arg
        let args = payload.command || payload.file_path || "";
        if (!args && payload.args) {
          const a = payload.args;
          if (a.cmd || a.workdir) args = `${a.cmd || ""}${a.workdir ? ` (${a.workdir})` : ""}`;
          else args = JSON.stringify(a).slice(0, 120);
        }
        turns.push({
          kind: "tool",
          tool: ev.tool_name || "tool",
          args,
          file_path: payload.file_path,
          command: payload.command,
          full_args: payload.args || null,
          ts,
        });
        break;
      }
      case "tool_result": {
        const text = payload.result_text || "";
        const isError = payload.is_error === true || (typeof ev.is_error === "number" && ev.is_error === 1);
        // attach to most recent tool turn (full text + error flag)
        for (let i = turns.length - 1; i >= 0; i--) {
          if (turns[i].kind === "tool" && turns[i].result == null) {
            turns[i].result = text;
            turns[i].result_summary = (text || "").slice(0, 140).replace(/\s+/g, " ");
            turns[i].is_error = isError;
            turns[i].result_lines = text ? text.split("\n").length : 0;
            turns[i].result_ts = ts;
            break;
          }
        }
        break;
      }
      // system / meta → skip in chat view
    }
  }
  return turns;
}

// Aggregate file paths from events for the detail panel.
function rtvFilesFromEvents(events) {
  if (!Array.isArray(events)) return [];
  const seen = new Set();
  for (const ev of events) {
    if (ev.event_type !== "tool_use") continue;
    let payload = {};
    try { payload = typeof ev.payload_json === "string" ? JSON.parse(ev.payload_json) : (ev.payload || {}); } catch { /* ignore */ }
    if (payload.file_path) seen.add(payload.file_path);
  }
  return [...seen];
}

function rtvSummaryFromEvents(events) {
  if (!Array.isArray(events)) return "";
  for (const ev of events) {
    if (ev.event_type !== "user_msg") continue;
    let payload = {};
    try { payload = typeof ev.payload_json === "string" ? JSON.parse(ev.payload_json) : (ev.payload || {}); } catch { /* ignore */ }
    if (payload.text) return payload.text.slice(0, 200);
  }
  return "";
}

// Expose globals for the other jsx modules (Babel standalone shares window scope).
window.RTV_LIVE = {
  fetchSessions: rtvFetchLiveSessions,
  searchSessions: rtvSearchLiveSessions,
  fetchDetail: rtvFetchLiveSessionDetail,
  fetchDaily: rtvFetchDaily,
  eventsToTurns: rtvEventsToTurns,
  filesFromEvents: rtvFilesFromEvents,
  summaryFromEvents: rtvSummaryFromEvents,
  shapeRow: rtvShapeRow,
  sinceFromWindow: rtvSinceFromWindow,
  untilFromWindow: rtvUntilFromWindow,
};
