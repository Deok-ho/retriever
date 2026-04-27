// Retriever — Plan (unified view over the work: same intent at different timescales)
// Views: Milestones | Roadmap (Gantt) | PERT | Sessions
//
// Mental model: Plan answers "what is the work, when does it happen, did it actually run?"
//   - Milestones = strategic intent (per-repo plan.md)
//   - Roadmap    = tactical schedule (Gantt of tickets)
//   - PERT       = dependency / critical path
//   - Sessions   = execution evidence (LLM session captures)

function PlanWorkView({ openAgent }) {
  const [view, setView] = React.useState("milestones");

  const views = [
    { id: "milestones", label: "Milestones", icon: "❒", sub: "plan.md" },
    { id: "roadmap",    label: "Roadmap",    icon: "⌗", sub: "gantt" },
    { id: "pert",       label: "PERT",       icon: "◈", sub: "deps" },
    { id: "sessions",   label: "Sessions",   icon: "✦", sub: "evidence" },
  ];

  // Aggregate counts for the header chip
  const counts = {
    milestones: PLAN_REPOS.reduce((s, r) => s + r.milestones.length, 0),
    roadmap:    RM_TICKETS.length,
    pert:       RM_TICKETS.length,
    sessions:   SB_SESSIONS.length,
  };

  return (
    <div>
      {/* View switcher (Notion-style) */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b flex-wrap gap-3"
           style={{ borderColor: "#E8E6DE" }}>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[20px] font-semibold text-[#1A1A1A] leading-none">Project</h1>
          <span className="text-[11px] font-mono" style={{ color: "#8A8680" }}>
            계획 · 일정 · 실행 — 같은 일을 4가지 시점으로
          </span>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-md" style={{ background: "#F3F1EC" }}>
          {views.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className="px-3 py-1.5 rounded text-[12px] inline-flex items-center gap-1.5 transition"
              style={{
                background: view === v.id ? "#FFFFFF" : "transparent",
                color: view === v.id ? "#1A1A1A" : "#5C5A55",
                fontWeight: view === v.id ? 600 : 400,
                boxShadow: view === v.id ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}>
              <span className="font-mono text-[12px]">{v.icon}</span>
              <span>{v.label}</span>
              <span className="font-mono text-[10px]" style={{ color: "#A88467" }}>· {counts[v.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "milestones" && <PlanView/>}
      {view === "roadmap"    && <RoadmapEmbed mode="gantt"/>}
      {view === "pert"       && <RoadmapEmbed mode="pert"/>}
      {view === "sessions"   && <SessionBrowser openAgent={openAgent}/>}
    </div>
  );
}

// Wrapper that calls Roadmap with a forced mode (suppresses Roadmap's own toggle)
function RoadmapEmbed({ mode }) {
  const [filter, setFilter] = React.useState("all");
  const tickets = RM_TICKETS.filter(t => filter === "all" || t.project === filter);
  const projects = ["all", ...Array.from(new Set(RM_TICKETS.map(t => t.project)))];
  const today = "2026-04-27";

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-mono" style={{ color: "#8A8680" }}>filter</span>
        <select value={filter} onChange={e => setFilter(e.target.value)}
                className="text-[12px] font-mono px-2 py-1.5 rounded-md border bg-white"
                style={{ borderColor: "#E8E6DE", color: "#3A3A36" }}>
          {projects.map(p => <option key={p} value={p}>{p === "all" ? "all projects" : p}</option>)}
        </select>
        <span className="ml-auto text-[11px] font-mono" style={{ color: "#5C5A55" }}>
          {mode === "gantt" ? "시간축으로 본 일정" : "의존 그래프 + critical path"}
        </span>
      </div>
      {mode === "gantt" ? <GanttChart tickets={tickets} today={today}/>
                        : <PertChart  tickets={tickets} today={today}/>}
    </div>
  );
}

Object.assign(window, { PlanWorkView });
