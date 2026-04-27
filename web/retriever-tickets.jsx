// Retriever — Tickets (Notion-style DB with multiple views over the same dataset)
// Views: Board | Table | Detail
// All read from the same TICKETS source. Roadmap/PERT live in the Plan view.

function TicketsView({ activeTicket, setActiveTicket, openAgent }) {
  const [view, setView] = React.useState(activeTicket ? "detail" : "board");

  // When user picks a ticket from anywhere, jump to detail
  const selectTicket = (id) => { setActiveTicket(id); setView("detail"); };

  const views = [
    { id: "board",     label: "Board",     icon: "▤" },
    { id: "table",     label: "Table",     icon: "◧" },
    { id: "detail",    label: "Detail",    icon: "◩", sub: activeTicket },
  ];

  return (
    <div>
      {/* View switcher (Notion-style) */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b" style={{ borderColor: "#E8E6DE" }}>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[20px] font-semibold text-[#1A1A1A] leading-none">Tickets</h1>
          <span className="text-[11px] font-mono" style={{ color: "#8A8680" }}>vault://tickets · {TICKETS.length} items</span>
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
              {v.sub && view === v.id && (
                <span className="font-mono text-[10px] ml-1 px-1.5 py-0.5 rounded"
                      style={{ background: "#FBEFE8", color: "#8F4E2C" }}>{v.sub}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {view === "board"  && <PortfolioBoard selectTicket={selectTicket} openAgent={openAgent}/>}
      {view === "table"  && <Dashboard selectTicket={selectTicket} openAgent={openAgent}/>}
      {view === "detail" && <TicketDetail taskId={activeTicket} openAgent={openAgent}/>}
    </div>
  );
}

Object.assign(window, { TicketsView });
