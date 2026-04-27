// Link Graph — vault ↔ code ↔ sessions

const LINK_NODES = [
  // vault (md)
  { id: "note_architecture",      kind: "vault",  label: "architecture.md",          project: "retriever" },
  { id: "note_adr012",            kind: "vault",  label: "ADR-012 rule-tuning.md",   project: "icube_quality" },
  { id: "note_daily_0425",        kind: "vault",  label: "2026-04-25.md",            project: "global" },
  { id: "note_gemma4_spec",       kind: "vault",  label: "gemma4-spec.md",           project: "retriever" },
  { id: "note_namedpipe",         kind: "vault",  label: "namedpipe-research.md",    project: "wmux" },

  // code (git)
  { id: "code_gemma4_ts",         kind: "code",   label: "src/adapters/gemma4.ts",   project: "retriever" },
  { id: "code_collector_ts",      kind: "code",   label: "src/collector.ts",         project: "retriever" },
  { id: "code_rules_rd20",        kind: "code",   label: "rules/R-D20.sql",          project: "icube_quality" },
  { id: "code_ipc_rs",            kind: "code",   label: "crates/ipc/lib.rs",        project: "wmux" },

  // sessions
  { id: "sess_claude_0422",       kind: "claude", label: "claude 04-22 adapter",     project: "retriever" },
  { id: "sess_claude_0420",       kind: "claude", label: "claude 04-20 probe",       project: "wmux" },
  { id: "sess_codex_0417",        kind: "codex",  label: "codex 04-17 ruletune",     project: "icube_quality" },
  { id: "sess_codex_0423",        kind: "codex",  label: "codex 04-23 perf",         project: "retriever" },

  // tickets (anchors)
  { id: "tkt_gemma4",             kind: "ticket", label: "#gemma4_adapter",          project: "retriever" },
  { id: "tkt_rd20",               kind: "ticket", label: "#auditor_false_positives", project: "icube_quality" },
  { id: "tkt_namedpipe",          kind: "ticket", label: "#namedpipe_ipc",           project: "wmux" },
];

const LINK_EDGES = [
  // ticket bundles
  { a: "tkt_gemma4", b: "sess_claude_0422", rel: "attach" },
  { a: "tkt_gemma4", b: "code_gemma4_ts",   rel: "attach" },
  { a: "tkt_gemma4", b: "note_gemma4_spec", rel: "attach" },
  { a: "note_gemma4_spec", b: "note_architecture", rel: "link" },

  { a: "tkt_rd20",   b: "note_adr012",      rel: "attach" },
  { a: "tkt_rd20",   b: "sess_codex_0417",  rel: "attach" },
  { a: "tkt_rd20",   b: "code_rules_rd20",  rel: "attach" },
  { a: "sess_codex_0417", b: "code_rules_rd20", rel: "touched" },

  { a: "tkt_namedpipe", b: "note_namedpipe",   rel: "attach" },
  { a: "tkt_namedpipe", b: "sess_claude_0420", rel: "attach" },
  { a: "tkt_namedpipe", b: "code_ipc_rs",      rel: "attach" },

  { a: "sess_codex_0423", b: "code_collector_ts", rel: "touched" },
  { a: "note_daily_0425", b: "tkt_gemma4",        rel: "mentions" },
  { a: "note_daily_0425", b: "tkt_rd20",          rel: "mentions" },
  { a: "note_daily_0425", b: "tkt_namedpipe",     rel: "mentions" },
  { a: "sess_claude_0422", b: "code_gemma4_ts",   rel: "touched" },
];

const KIND_STYLE = {
  vault:  { color: "#A88467", bg: "#F7F1E8", icon: "📘" },
  code:   { color: "#4A6B8A", bg: "#EAF0F6", icon: "{ }" },
  claude: { color: "#C26F4A", bg: "#FBEFE8", icon: "✦" },
  codex:  { color: "#8F4E2C", bg: "#F6E6DC", icon: "◆" },
  ticket: { color: "#1A1A1A", bg: "#F0EEE6", icon: "📎" },
};

function LinkGraph() {
  const [focus, setFocus] = React.useState("tkt_gemma4");
  const [view,  setView]  = React.useState("graph"); // graph | today

  // Radial layout around the focused node
  const cx = 560, cy = 360;
  const positioned = React.useMemo(() => {
    const pos = {};
    const neighbors = new Set();
    LINK_EDGES.forEach(e => {
      if (e.a === focus) neighbors.add(e.b);
      if (e.b === focus) neighbors.add(e.a);
    });
    const second = new Set();
    LINK_EDGES.forEach(e => {
      if (neighbors.has(e.a) && e.b !== focus) second.add(e.b);
      if (neighbors.has(e.b) && e.a !== focus) second.add(e.a);
    });
    neighbors.forEach(n => second.delete(n));
    second.delete(focus);

    pos[focus] = { x: cx, y: cy, ring: 0 };
    const na = Array.from(neighbors);
    na.forEach((id, i) => {
      const a = (i / na.length) * Math.PI * 2 - Math.PI / 2;
      pos[id] = { x: cx + Math.cos(a) * 180, y: cy + Math.sin(a) * 180, ring: 1 };
    });
    const sa = Array.from(second);
    sa.forEach((id, i) => {
      const a = (i / Math.max(1, sa.length)) * Math.PI * 2 - Math.PI / 4;
      pos[id] = { x: cx + Math.cos(a) * 310, y: cy + Math.sin(a) * 310, ring: 2 };
    });
    // Any remaining nodes along the bottom edge
    LINK_NODES.forEach((n, i) => {
      if (pos[n.id]) return;
      pos[n.id] = { x: 80 + (i % 6) * 170, y: 680, ring: 3 };
    });
    return pos;
  }, [focus]);

  const relEdges = LINK_EDGES.filter(e => e.a === focus || e.b === focus);
  const focusNode = LINK_NODES.find(n => n.id === focus);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>/ link-graph</div>
          <h1 className="text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-1">Source link graph</h1>
          <p className="text-[13px] text-[#5C5A55] mt-1">Vault 노트·코드·세션·티켓이 서로 어떻게 참조되는지 시각화합니다. 노드 클릭으로 중심 이동.</p>
        </div>
        <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: "#E8E6DE" }}>
          {[["graph", "Graph"], ["today", "Daily Note"]].map(([v, l], i) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-[12px] ${i > 0 ? "border-l" : ""}`}
              style={{ borderColor: "#E8E6DE", background: view === v ? "#FBEFE8" : "#FFFFFF", color: view === v ? "#8F4E2C" : "#5C5A55" }}>{l}</button>
          ))}
        </div>
      </div>

      {view === "graph" ? (
        <div className="grid grid-cols-[1fr_320px] gap-4">
          <Card className="p-0 overflow-hidden">
            <svg viewBox="0 0 1120 760" className="w-full" style={{ display: "block", background: "#FDFCF7" }}>
              <defs>
                <pattern id="lg-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#EBE8DE"/>
                </pattern>
              </defs>
              <rect width="1120" height="760" fill="url(#lg-grid)"/>

              {/* Edges */}
              {LINK_EDGES.map((e, i) => {
                const a = positioned[e.a], b = positioned[e.b];
                if (!a || !b) return null;
                const isRel = e.a === focus || e.b === focus;
                const stroke = e.rel === "attach" ? "#C26F4A" : e.rel === "touched" ? "#4A6B8A" : "#A88467";
                return (
                  <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke={stroke} strokeWidth={isRel ? 1.6 : 0.8}
                        strokeDasharray={e.rel === "mentions" ? "3 3" : "0"}
                        opacity={isRel ? 0.9 : 0.18}/>
                );
              })}

              {/* Nodes */}
              {LINK_NODES.map(n => {
                const p = positioned[n.id];
                if (!p) return null;
                const st = KIND_STYLE[n.kind];
                const isFocus = n.id === focus;
                const isNeighbor = relEdges.some(e => e.a === n.id || e.b === n.id);
                const dim = !isFocus && !isNeighbor;
                const r = isFocus ? 12 : n.kind === "ticket" ? 10 : 7;
                return (
                  <g key={n.id} onClick={() => setFocus(n.id)} style={{ cursor: "pointer", opacity: dim ? 0.28 : 1, transition: "opacity 180ms" }}>
                    <circle cx={p.x} cy={p.y} r={r + 3} fill={st.bg}/>
                    <circle cx={p.x} cy={p.y} r={r} fill={st.color} stroke="#FFFFFF" strokeWidth={isFocus ? 3 : 1.5}/>
                    <text x={p.x + r + 6} y={p.y + 4} fontSize={isFocus ? 12 : 11}
                          fontFamily="JetBrains Mono" fill="#1A1A1A" fontWeight={isFocus ? 600 : 400}>{n.label}</text>
                    <text x={p.x + r + 6} y={p.y + 18} fontSize="9" fontFamily="JetBrains Mono" fill="#8A8680">{n.project}</text>
                  </g>
                );
              })}
            </svg>
          </Card>

          <div className="space-y-3">
            <Card className="p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "#8A8680" }}>focus</div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="w-3 h-3 rounded-full" style={{ background: KIND_STYLE[focusNode.kind].color }}></span>
                <div className="text-[14px] font-mono text-[#1A1A1A]">{focusNode.label}</div>
              </div>
              <div className="text-[11px] font-mono mt-1" style={{ color: "#8A8680" }}>{focusNode.kind} · {focusNode.project}</div>
            </Card>

            <Card className="p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "#8A8680" }}>links ({relEdges.length})</div>
              <div className="space-y-1">
                {relEdges.map((e, i) => {
                  const other = e.a === focus ? e.b : e.a;
                  const nd = LINK_NODES.find(n => n.id === other);
                  const st = KIND_STYLE[nd.kind];
                  return (
                    <button key={i} onClick={() => setFocus(other)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-[#FAFAF7]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: st.color }}></span>
                      <span className="text-[12px] font-mono text-[#1A1A1A] truncate flex-1 min-w-0">{nd.label}</span>
                      <span className="text-[10px] font-mono flex-shrink-0" style={{ color: "#8A8680" }}>{e.rel}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "#8A8680" }}>legend</div>
              <div className="space-y-1 text-[11px] font-mono">
                {Object.entries(KIND_STYLE).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: v.color }}></span>
                    <span className="text-[#3A3A36]">{k}</span>
                  </div>
                ))}
                <div className="h-2"/>
                <div className="flex items-center gap-2"><span style={{ color: "#C26F4A" }}>━</span><span>attach</span></div>
                <div className="flex items-center gap-2"><span style={{ color: "#4A6B8A" }}>━</span><span>touched</span></div>
                <div className="flex items-center gap-2"><span style={{ color: "#A88467" }}>╌</span><span>mentions / link</span></div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <DailyNote/>
      )}
    </div>
  );
}

function DailyNote() {
  const items = [
    { t: "08:02", kind: "code",   label: "src/adapters/gemma4.ts",   text: "+147 / −12" },
    { t: "09:14", kind: "vault",  label: "2026-04-25.md",            text: "morning notes" },
    { t: "09:40", kind: "claude", label: "claude session · adapter", text: "verify done criteria" },
    { t: "11:20", kind: "vault",  label: "ADR-012 rule-tuning.md",   text: "published" },
    { t: "14:05", kind: "codex",  label: "codex session · perf",     text: "collector incremental" },
    { t: "15:30", kind: "code",   label: "src/collector.ts",         text: "+81 / −40" },
    { t: "18:00", kind: "vault",  label: "namedpipe-research.md",    text: "meeting notes" },
  ];
  return (
    <Card className="p-5">
      <div className="text-[11px] font-mono uppercase tracking-wider mb-3" style={{ color: "#8A8680" }}>2026-04-25 — 모든 흐름 한 줄로</div>
      <div className="relative pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-px" style={{ background: "#E8E6DE" }}></div>
        {items.map((x, i) => {
          const st = KIND_STYLE[x.kind];
          return (
            <div key={i} className="relative flex items-start gap-3 py-2.5 border-b last:border-0" style={{ borderColor: "#F0EEE6" }}>
              <span className="absolute -left-[18px] w-3 h-3 rounded-full mt-1.5" style={{ background: st.color, boxShadow: "0 0 0 3px #FDFCF7" }}></span>
              <span className="text-[11px] font-mono w-12 flex-shrink-0" style={{ color: "#8A8680" }}>{x.t}</span>
              <span className="text-[10px] font-mono uppercase w-12 flex-shrink-0" style={{ color: st.color }}>{x.kind}</span>
              <span className="text-[12px] font-mono text-[#1A1A1A] flex-1 min-w-0 truncate">{x.label}</span>
              <span className="text-[11px]" style={{ color: "#5C5A55" }}>{x.text}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

Object.assign(window, { LinkGraph });
