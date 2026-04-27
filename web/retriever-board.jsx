// Portfolio Board (칸반)

function PortfolioBoard({ selectTicket, openAgent }) {
  const [range, setRange] = React.useState("all"); // all / week / stalled
  const [tickets, setTickets] = React.useState(TICKETS);
  const [dragging, setDragging] = React.useState(null);
  const [dropCol, setDropCol] = React.useState(null);

  const columns = [
    { id: "todo",        label: "Todo",       wip_limit: 5 },
    { id: "in_progress", label: "Doing",      wip_limit: 3 },
    { id: "review",      label: "Review",     wip_limit: 3 },
    { id: "done",        label: "Done" },
    { id: "blocked",     label: "Blocked",    warn: true },
  ];

  const filtered = tickets.filter(t => {
    if (range === "stalled") return t.status === "stalled" || t.stalled_since;
    if (range === "week") {
      const d = t.updated || t.created;
      return d && d >= "2026-04-19";
    }
    return true;
  });

  // stalled rows merge into blocked column for view compactness
  const byCol = Object.fromEntries(columns.map(c => [c.id, []]));
  filtered.forEach(t => {
    const s = t.status === "stalled" ? "blocked" : t.status;
    if (byCol[s]) byCol[s].push(t);
  });

  const onDrop = (colId) => {
    if (!dragging) return;
    setTickets(prev => prev.map(t => t.task_id === dragging ? { ...t, status: colId, stalled_since: null } : t));
    setDragging(null); setDropCol(null);
    const moved = tickets.find(t => t.task_id === dragging);
    if (moved && colId === "done") openAgent(moved.task_id, "verify_completion");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-[11px] font-mono text-[#8A8680]">/ portfolio</div>
          <h1 className="text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-1">Portfolio</h1>
          <p className="text-[13px] text-[#5C5A55] mt-1">티켓 번들을 상태별로 정리합니다. 드래그로 상태 전이, 완료 이동 시 에이전트가 검증을 제안합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: "#E8E6DE" }}>
            {[["all", "All"], ["week", "This Week"], ["stalled", "Stalled"]].map(([v, l], i) => (
              <button key={v} onClick={() => setRange(v)}
                className={`px-3 py-1.5 text-[12px] ${i > 0 ? "border-l" : ""}`}
                style={{
                  borderColor: "#E8E6DE",
                  background: range === v ? "#FBEFE8" : "#FFFFFF",
                  color: range === v ? "#8F4E2C" : "#5C5A55",
                }}>{l}</button>
            ))}
          </div>
          <button className="px-3 py-1.5 rounded-md text-[12px] text-white" style={{ background: "#C26F4A" }}>+ 새 티켓</button>
        </div>
      </div>

      {/* Board */}
      <div className="grid grid-cols-5 gap-4" style={{ minHeight: 640 }}>
        {columns.map(col => {
          const items = byCol[col.id] || [];
          const over = col.wip_limit && items.length > col.wip_limit;
          const target = dropCol === col.id;
          return (
            <div key={col.id}
              onDragOver={e => { e.preventDefault(); setDropCol(col.id); }}
              onDragLeave={() => setDropCol(c => c === col.id ? null : c)}
              onDrop={() => onDrop(col.id)}
              className="rounded-lg border transition"
              style={{
                background: target ? "#FBEFE8" : "#FAFAF7",
                borderColor: target ? "#C26F4A" : col.warn ? "#E4C4C4" : "#E8E6DE",
                borderLeftWidth: col.warn ? 3 : 1,
              }}>
              <div className="px-2.5 pt-3 pb-2 flex items-center gap-1.5 border-b whitespace-nowrap overflow-hidden" style={{ borderColor: "#E8E6DE" }}>
                <span className="text-[12px] font-semibold text-[#1A1A1A]">{col.label}</span>
                <span className="text-[10px] font-mono ml-auto flex-shrink-0" style={{ color: over ? "#A83E3E" : "#8A8680" }}>
                  {items.length}{col.wip_limit ? `/${col.wip_limit}` : ""}{over ? " ↑" : ""}
                </span>
              </div>
              <div className="p-2 space-y-2">
                {items.length === 0 && <div className="text-[11px] text-[#B5B1A8] text-center py-6 border border-dashed rounded" style={{ borderColor: "#E8E6DE" }}>비어있음</div>}
                {items.map(t => <BoardCard key={t.task_id} t={t} drag={dragging} setDrag={setDragging} onClick={() => selectTicket(t.task_id)}/>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ t, drag, setDrag, onClick }) {
  const isStalled = !!t.stalled_since;
  const stalledDays = isStalled ? Math.max(1, Math.round((Date.parse(TODAY) - Date.parse(t.stalled_since)) / 86400000)) : 0;
  const doneCount = (t.criteria || []).filter(c => c.done).length;
  const totalCount = (t.criteria || []).length;
  return (
    <div
      draggable
      onDragStart={() => setDrag(t.task_id)}
      onDragEnd={() => setDrag(null)}
      onClick={onClick}
      className={`rounded-md border p-2.5 cursor-pointer transition ${drag === t.task_id ? "opacity-40" : ""}`}
      style={{
        background: "#FFFFFF",
        borderColor: "#E8E6DE",
        borderLeft: isStalled ? "4px solid #B89028" : "1px solid #E8E6DE",
      }}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono" style={{ color: "#8A8680" }}>
        <span className="truncate min-w-0">{t.project}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <PriorityPill p={t.priority}/>
          {t.attachments > 0 && <Paperclip count={t.attachments}/>}
        </div>
      </div>
      {isStalled && (
        <div className="mt-1 text-[10px] font-mono inline-block px-1.5 rounded" style={{ background: "#F7EED6", color: "#8C6D1E" }}>
          stalled {stalledDays}d
        </div>
      )}
      <div className="mt-1.5 text-[13px] text-[#1A1A1A] leading-snug line-clamp-2">{t.summary}</div>
      <div className="mt-1.5 text-[10px] font-mono truncate" style={{ color: "#8A8680" }}>
        {t.task_type}
        {t.est_h && <span> · est {t.est_h}h</span>}
        {t.actual_h && <span> · act {t.actual_h}h</span>}
      </div>
      {totalCount > 0 && (
        <div className="mt-2">
          <ProgressBar done={doneCount} total={totalCount}/>
          <div className="mt-1 text-[10px] font-mono" style={{ color: "#8A8680" }}>{doneCount}/{totalCount} criteria</div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PortfolioBoard });
