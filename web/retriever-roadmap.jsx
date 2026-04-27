// Retriever — Roadmap (Gantt / PERT toggle)

const RM_TICKETS = [
  // retriever
  { id: "session_mgr_3b",     project: "retriever",      summary: "Session Manager (3B)",      status: "in_progress", priority: "high", start: "2026-04-22", end: "2026-05-04", est_h: 28, actual_h: 16, owner: "you",        deps: [] },
  { id: "summary_cache",      project: "retriever",      summary: "Summary cache invalidation", status: "in_progress", priority: "high", start: "2026-04-26", end: "2026-04-30", est_h: 12, actual_h: 6,  owner: "you",        deps: ["session_mgr_3b"] },
  { id: "gemma4_adapter",     project: "retriever",      summary: "Gemma4 adapter (done)",      status: "done",        priority: "high", start: "2026-04-21", end: "2026-04-23", est_h: 10, actual_h: 9,  owner: "you",        deps: [] },
  { id: "watchdog_tune",      project: "retriever",      summary: "Watchdog adaptive polling",   status: "review",      priority: "med",  start: "2026-04-24", end: "2026-04-28", est_h:  8, actual_h: 7,  owner: "codex_ci",   deps: [] },
  { id: "session_mgr_3c",     project: "retriever",      summary: "Session Manager (3C export)", status: "todo",       priority: "high", start: "2026-05-04", end: "2026-05-12", est_h: 24, actual_h: 0,  owner: "you",        deps: ["session_mgr_3b", "summary_cache"] },

  // icube-quality
  { id: "auditor_false_pos",  project: "icube_quality",  summary: "R-D20 false-positive 튜닝",  status: "in_progress", priority: "high", start: "2026-04-15", end: "2026-04-29", est_h: 20, actual_h: 14, owner: "you",        deps: [] },
  { id: "rules_v2",           project: "icube_quality",  summary: "Rules v2 (정합성 강화)",      status: "todo",        priority: "med",  start: "2026-04-30", end: "2026-05-10", est_h: 30, actual_h: 0,  owner: "you",        deps: ["auditor_false_pos"] },
  { id: "alarm_routing",      project: "icube_quality",  summary: "Google Chat 라우팅",          status: "blocked",     priority: "high", start: "2026-04-22", end: "2026-04-30", est_h: 12, actual_h: 4,  owner: "you",        deps: [] },

  // wmux
  { id: "namedpipe_ipc",      project: "wmux",           summary: "Named-pipe IPC (Windows)",   status: "blocked",     priority: "med",  start: "2026-04-15", end: "2026-04-30", est_h: 18, actual_h: 11, owner: "you",        deps: [] },
  { id: "termios_state",      project: "wmux",           summary: "Termios 상태 보존",            status: "todo",        priority: "low",  start: "2026-05-01", end: "2026-05-09", est_h: 16, actual_h: 0,  owner: "you",        deps: ["namedpipe_ipc"] },

  // mbo_tally
  { id: "weekly_export",      project: "mbo_tally",      summary: "주간 export PDF",              status: "review",      priority: "med",  start: "2026-04-23", end: "2026-04-28", est_h:  6, actual_h: 5,  owner: "you",        deps: [] },
];

const RM_PROJECT_COLOR = {
  retriever:     "#C26F4A",
  icube_quality: "#4A6B8A",
  wmux:          "#5A8C6F",
  mbo_tally:     "#A88467",
};

const RM_STATUS_DASH = {
  todo:        "6 4",
  in_progress: "0",
  review:      "0",
  done:        "0",
  blocked:     "2 3",
};

function dayDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10);
}

function Roadmap({ selectTicket }) {
  const [mode, setMode] = React.useState("gantt"); // gantt | pert
  const [filter, setFilter] = React.useState("all");
  const [today]  = React.useState("2026-04-27");

  const tickets = RM_TICKETS.filter(t => filter === "all" || t.project === filter);
  const projects = ["all", ...Array.from(new Set(RM_TICKETS.map(t => t.project)))];

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>/ roadmap</div>
          <h1 className="text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-1">Roadmap</h1>
          <p className="text-[13px] text-[#5C5A55] mt-1">티켓의 일정과 의존을 시간축(Gantt)과 의존 그래프(PERT)로 봅니다. 모든 일정은 <span className="font-mono">ticket.md</span> frontmatter에서 읽어들입니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)}
                  className="text-[12px] font-mono px-2 py-1.5 rounded-md border bg-white"
                  style={{ borderColor: "#E8E6DE", color: "#3A3A36" }}>
            {projects.map(p => <option key={p} value={p}>{p === "all" ? "all projects" : p}</option>)}
          </select>
          <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: "#E8E6DE" }}>
            {[["gantt", "Gantt"], ["pert", "PERT"]].map(([v, l], i) => (
              <button key={v} onClick={() => setMode(v)}
                className={`px-3 py-1.5 text-[12px] ${i > 0 ? "border-l" : ""}`}
                style={{
                  borderColor: "#E8E6DE",
                  background: mode === v ? "#FBEFE8" : "#FFFFFF",
                  color: mode === v ? "#8F4E2C" : "#5C5A55",
                }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {mode === "gantt" ? <GanttChart tickets={tickets} today={today} selectTicket={selectTicket}/>
                        : <PertChart  tickets={tickets} today={today} selectTicket={selectTicket}/>}
    </div>
  );
}

function GanttChart({ tickets, today, selectTicket }) {
  // Determine date range
  const minD = tickets.reduce((a, t) => a < t.start ? a : t.start, "2999-12-31");
  const maxD = tickets.reduce((a, t) => a > t.end   ? a : t.end,   "1970-01-01");
  // Round to week boundaries
  const start = (() => { const d = new Date(minD); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })();
  const end   = (() => { const d = new Date(maxD); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().slice(0, 10); })();
  const totalDays = dayDiff(start, end) + 1;

  const rowH = 36, headH = 56, leftW = 240;
  const colW = 22; // px per day
  const W = leftW + totalDays * colW + 20;
  const H = headH + tickets.length * rowH + 20;

  const todayX = leftW + dayDiff(start, today) * colW;

  // Week grid
  const weeks = [];
  for (let d = 0; d <= totalDays; d += 7) weeks.push(d);
  const months = [];
  for (let d = 0; d < totalDays; d++) {
    const date = addDays(start, d);
    if (date.endsWith("-01") || d === 0) months.push({ d, date });
  }

  // Build dependency map for arrows
  const idx = Object.fromEntries(tickets.map((t, i) => [t.id, i]));

  return (
    <Card className="p-0 overflow-x-auto">
      <svg width={W} height={H} style={{ display: "block", background: "#FDFCF7" }}>
        <defs>
          <marker id="rm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#A88467"/>
          </marker>
        </defs>

        {/* Week stripes */}
        {weeks.map((d, i) => (
          <rect key={i} x={leftW + d * colW} y={headH} width={7 * colW} height={H - headH}
                fill={i % 2 === 0 ? "#FAFAF7" : "#FFFFFF"}/>
        ))}

        {/* Vertical day grid (lighter) */}
        {Array.from({ length: totalDays + 1 }).map((_, d) => (
          <line key={d} x1={leftW + d * colW} y1={headH} x2={leftW + d * colW} y2={H - 10}
                stroke={d % 7 === 0 ? "#E8E6DE" : "#F2F0E9"} strokeWidth={d % 7 === 0 ? 1 : 0.5}/>
        ))}

        {/* Month labels */}
        {months.map((m, i) => (
          <text key={i} x={leftW + m.d * colW + 4} y={18} fontSize="10" fontFamily="JetBrains Mono"
                fill="#8A8680">{m.date.slice(0, 7)}</text>
        ))}

        {/* Day-of-week ticks */}
        {weeks.map((d, i) => (
          <text key={i} x={leftW + d * colW + 2} y={42} fontSize="9" fontFamily="JetBrains Mono"
                fill="#A88467">w{i + 1}</text>
        ))}

        {/* Today line */}
        {todayX > leftW && todayX < W - 10 && (
          <g>
            <line x1={todayX} y1={headH - 10} x2={todayX} y2={H - 10} stroke="#C26F4A" strokeWidth={1.5} strokeDasharray="2 2"/>
            <rect x={todayX - 24} y={headH - 22} width="48" height="14" rx="3" fill="#C26F4A"/>
            <text x={todayX} y={headH - 12} fontSize="9" fontFamily="JetBrains Mono" fill="#FFFFFF" textAnchor="middle">today</text>
          </g>
        )}

        {/* Header bottom border */}
        <line x1={0} y1={headH} x2={W} y2={headH} stroke="#E8E6DE"/>
        <line x1={leftW} y1={0} x2={leftW} y2={H} stroke="#E8E6DE"/>

        {/* Rows */}
        {tickets.map((t, i) => {
          const y = headH + i * rowH;
          const x1 = leftW + dayDiff(start, t.start) * colW;
          const x2 = leftW + (dayDiff(start, t.end) + 1) * colW;
          const w = Math.max(8, x2 - x1);
          const c = RM_PROJECT_COLOR[t.project] || "#A88467";
          const progress = t.est_h ? Math.min(1, t.actual_h / t.est_h) : 0;

          return (
            <g key={t.id} onClick={() => selectTicket && selectTicket(t.id)} style={{ cursor: "pointer" }}>
              {/* Row hover band */}
              <rect x={0} y={y} width={W} height={rowH} fill="transparent"/>

              {/* Label cell */}
              <rect x={0} y={y} width={leftW} height={rowH} fill="#FDFCF7"/>
              <line x1={0} y1={y + rowH} x2={W} y2={y + rowH} stroke="#F2F0E9"/>
              <circle cx={12} cy={y + rowH / 2} r={4} fill={c}/>
              <text x={22} y={y + rowH / 2 + 4} fontSize="11" fontFamily="JetBrains Mono" fill="#1A1A1A">{t.id}</text>
              <text x={leftW - 8} y={y + rowH / 2 + 4} fontSize="9" fontFamily="JetBrains Mono"
                    fill="#8A8680" textAnchor="end">{t.owner}</text>

              {/* Bar */}
              <rect x={x1} y={y + 8} width={w} height={20} rx={3}
                    fill={t.status === "blocked" ? "#FBECEC" : t.status === "done" ? "#F1F7F3" : "#FBEFE8"}
                    stroke={t.status === "blocked" ? "#A83E3E" : c}
                    strokeWidth={1}
                    strokeDasharray={RM_STATUS_DASH[t.status]}/>
              {/* Progress fill */}
              {progress > 0 && t.status !== "blocked" && (
                <rect x={x1 + 1} y={y + 9} width={Math.max(0, (w - 2) * progress)} height={18} rx={2}
                      fill={c} opacity="0.45"/>
              )}
              <text x={x1 + 6} y={y + 22} fontSize="10" fontFamily="JetBrains Mono"
                    fill={t.status === "done" ? "#5A8C6F" : t.status === "blocked" ? "#A83E3E" : "#1A1A1A"}>
                {t.summary} <tspan fill="#8A8680">· {t.actual_h}/{t.est_h}h</tspan>
              </text>
            </g>
          );
        })}

        {/* Dependency arrows */}
        {tickets.map(t => t.deps.map((d, k) => {
          const a = tickets.find(x => x.id === d);
          if (!a) return null;
          const i = idx[a.id], j = idx[t.id];
          const ax = leftW + (dayDiff(start, a.end) + 1) * colW;
          const ay = headH + i * rowH + 18;
          const bx = leftW + dayDiff(start, t.start) * colW;
          const by = headH + j * rowH + 18;
          return (
            <path key={t.id + "-" + k} d={`M ${ax} ${ay} L ${ax + 6} ${ay} L ${ax + 6} ${by} L ${bx - 1} ${by}`}
                  fill="none" stroke="#A88467" strokeWidth={1} markerEnd="url(#rm-arrow)" opacity="0.7"/>
          );
        }))}
      </svg>
    </Card>
  );
}

function PertChart({ tickets, today, selectTicket }) {
  // Compute earliest start (ES) by topological order
  const byId = Object.fromEntries(tickets.map(t => [t.id, t]));
  const ES = {}, EF = {};
  const visit = (id) => {
    if (ES[id] !== undefined) return;
    const t = byId[id]; if (!t) return;
    let es = 0;
    for (const d of t.deps) {
      if (byId[d]) {
        visit(d);
        es = Math.max(es, EF[d]);
      }
    }
    ES[id] = es;
    EF[id] = es + t.est_h;
  };
  tickets.forEach(t => visit(t.id));

  // Critical path: longest path
  const projectEnd = Math.max(...Object.values(EF), 0);
  // Compute LF/LS by reverse pass
  const successors = {};
  tickets.forEach(t => t.deps.forEach(d => { (successors[d] = successors[d] || []).push(t.id); }));
  const LF = {}, LS = {};
  const setLate = (id) => {
    if (LF[id] !== undefined) return LF[id];
    const succ = successors[id] || [];
    let lf;
    if (succ.length === 0) lf = projectEnd;
    else lf = Math.min(...succ.map(s => setLate(s) - byId[s].est_h));
    LF[id] = lf;
    LS[id] = lf - byId[id].est_h;
    return lf;
  };
  tickets.forEach(t => setLate(t.id));
  const slack = (id) => LS[id] - ES[id];

  // Layout by ES rank
  const ranks = {};
  tickets.forEach(t => {
    const r = Object.values(byId).filter(x => EF[x.id] <= ES[t.id]).length === 0 && t.deps.length === 0
      ? 0 : Math.max(0, ...t.deps.map(d => (ranks[d] ?? 0) + 1));
    ranks[t.id] = r;
  });
  const byRank = {};
  tickets.forEach(t => { (byRank[ranks[t.id]] = byRank[ranks[t.id]] || []).push(t); });
  const maxRank = Math.max(...Object.values(ranks));

  const colWidth = 220, rowHeight = 92, padX = 30, padY = 30;
  const W = padX * 2 + (maxRank + 1) * colWidth;
  const H = padY * 2 + Math.max(...Object.values(byRank).map(a => a.length)) * rowHeight;

  const pos = {};
  for (let r = 0; r <= maxRank; r++) {
    const rowTickets = (byRank[r] || []).sort((a, b) => a.id.localeCompare(b.id));
    rowTickets.forEach((t, i) => {
      pos[t.id] = { x: padX + r * colWidth, y: padY + i * rowHeight };
    });
  }

  const isCritical = (id) => slack(id) === 0;

  return (
    <Card className="p-0 overflow-x-auto">
      <svg width={W} height={H} style={{ display: "block", background: "#FDFCF7" }}>
        <defs>
          <marker id="pert-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#A88467"/>
          </marker>
          <marker id="pert-arrow-crit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#C26F4A"/>
          </marker>
          <pattern id="pert-grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#EBE8DE"/>
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#pert-grid)"/>

        {/* Edges */}
        {tickets.map(t => t.deps.map((d, k) => {
          const a = pos[d], b = pos[t.id];
          if (!a || !b) return null;
          const x1 = a.x + 200, y1 = a.y + 36;
          const x2 = b.x,        y2 = b.y + 36;
          const mx = (x1 + x2) / 2;
          const crit = isCritical(d) && isCritical(t.id);
          return (
            <path key={t.id + d + k} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none" stroke={crit ? "#C26F4A" : "#A88467"} strokeWidth={crit ? 2 : 1}
                  markerEnd={crit ? "url(#pert-arrow-crit)" : "url(#pert-arrow)"}/>
          );
        }))}

        {/* Nodes */}
        {tickets.map(t => {
          const p = pos[t.id]; if (!p) return null;
          const c = RM_PROJECT_COLOR[t.project] || "#A88467";
          const crit = isCritical(t.id);
          return (
            <g key={t.id} onClick={() => selectTicket && selectTicket(t.id)} style={{ cursor: "pointer" }}>
              <rect x={p.x} y={p.y} width={200} height={72} rx={6}
                    fill="#FFFFFF" stroke={crit ? "#C26F4A" : "#E8E6DE"}
                    strokeWidth={crit ? 2 : 1}/>
              <rect x={p.x} y={p.y} width={6} height={72} fill={c}/>
              <text x={p.x + 14} y={p.y + 18} fontSize="11" fontFamily="JetBrains Mono" fontWeight="600" fill="#1A1A1A">{t.id}</text>
              <text x={p.x + 14} y={p.y + 32} fontSize="10" fontFamily="JetBrains Mono" fill="#5C5A55">
                {t.summary.length > 26 ? t.summary.slice(0, 26) + "…" : t.summary}
              </text>
              {/* Mini-table */}
              <text x={p.x + 14} y={p.y + 52} fontSize="9" fontFamily="JetBrains Mono" fill="#8A8680">
                ES <tspan fill="#1A1A1A">{ES[t.id]}h</tspan>  EF <tspan fill="#1A1A1A">{EF[t.id]}h</tspan>
              </text>
              <text x={p.x + 14} y={p.y + 64} fontSize="9" fontFamily="JetBrains Mono" fill="#8A8680">
                slack <tspan fill={crit ? "#C26F4A" : "#1A1A1A"} fontWeight={crit ? 600 : 400}>{slack(t.id)}h</tspan>
                {crit && <tspan fill="#C26F4A">  · CRITICAL</tspan>}
              </text>
              <text x={p.x + 192} y={p.y + 18} fontSize="9" fontFamily="JetBrains Mono" fill={c} textAnchor="end">{t.project}</text>
            </g>
          );
        })}
      </svg>
      <div className="px-4 py-3 border-t flex items-center gap-4 text-[11px] font-mono"
           style={{ borderColor: "#E8E6DE", background: "#FDFCF7", color: "#5C5A55" }}>
        <span>Project end · <span className="text-[#1A1A1A]">{projectEnd}h</span></span>
        <span>Critical path · <span style={{ color: "#C26F4A" }}>{tickets.filter(t => isCritical(t.id)).map(t => t.id).join(" → ")}</span></span>
      </div>
    </Card>
  );
}

Object.assign(window, { Roadmap });
