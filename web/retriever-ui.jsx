// Retriever — UI primitives & tokens

const TOKENS = {
  bg: "#FAFAF7", surface: "#FFFFFF", text: "#1A1A1A", border: "#E8E6DE",
  action: "#C26F4A", info: "#4A6B8A",
  active: "#C26F4A", blocked: "#A83E3E", stalled: "#B89028", done: "#5A8C6F", todo: "#8A8680",
};

const STATUS_META = {
  todo:        { label: "Todo",        color: "#8A8680", bg: "#F3F1EC", border: "#E0DDD3" },
  in_progress: { label: "In Progress", color: "#C26F4A", bg: "#FBEFE8", border: "#EDD4C2" },
  review:      { label: "Review",      color: "#4A6B8A", bg: "#EAF0F6", border: "#CFDAE7" },
  done:        { label: "Done",        color: "#5A8C6F", bg: "#E8F1EC", border: "#CADBCF" },
  blocked:     { label: "Blocked",     color: "#A83E3E", bg: "#F6E4E4", border: "#E4C4C4" },
  stalled:     { label: "Stalled",     color: "#B89028", bg: "#F7EED6", border: "#E5D5A5" },
};

const PRIORITY_META = {
  high: { label: "high", color: "#A83E3E", bg: "#F6E4E4" },
  med:  { label: "med",  color: "#B89028", bg: "#F7EED6" },
  low:  { label: "low",  color: "#8A8680", bg: "#F3F1EC" },
};

const HEALTH_COLORS = { green: "#5A8C6F", yellow: "#B89028", red: "#A83E3E" };

const ATTACH_ICON = {
  session:    "💬",
  diff:       "◇",
  research:   "☰",
  external:   "↗",
  transcript: "⎊",
};

function Pill({ children, color, bg, border, mono, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${mono ? "font-mono" : ""} ${className}`}
      style={{ color, background: bg, border: `1px solid ${border || bg}` }}>
      {children}
    </span>
  );
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.todo;
  return (
    <Pill color={m.color} bg={m.bg} border={m.border} mono>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }}></span>
      {m.label}
    </Pill>
  );
}

function PriorityPill({ p }) {
  const m = PRIORITY_META[p] || PRIORITY_META.med;
  return (
    <span className="inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
          style={{ color: m.color, background: m.bg }}>
      <span className="w-1 h-1 rounded-full mr-1" style={{ background: m.color }}></span>{m.label}
    </span>
  );
}

function Paperclip({ count, onClick }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-[#F3F1EC] text-[11px] text-[#5C5A55] font-mono whitespace-nowrap">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
        <path d="M8 4 a4 4 0 0 1 8 0 v12 a3 3 0 0 1 -6 0 v-9 a2 2 0 0 1 4 0 v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
      </svg>
      <span>{count}</span>
    </button>
  );
}

function Sparkle({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z" fill="#C26F4A"/>
      <circle cx="19" cy="4" r="1.2" fill="#C26F4A"/>
      <circle cx="4" cy="19" r="1" fill="#C26F4A"/>
    </svg>
  );
}

function AIButton({ children, onClick, className = "" }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] transition ${className}`}
      style={{ borderColor: "#EDD4C2", background: "#FBEFE8", color: "#8F4E2C" }}>
      <Sparkle size={12}/>
      <span>{children}</span>
    </button>
  );
}

function OnDeviceBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: "#EAF0F6", color: "#4A6B8A" }}>
      <span className="w-1 h-1 rounded-full" style={{ background: "#4A6B8A" }}></span>
      on-device
    </span>
  );
}

function HealthDot({ h }) {
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: HEALTH_COLORS[h] || HEALTH_COLORS.green }}></span>;
}

function ProgressBar({ done, total }) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return (
    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "#EFECE3" }}>
      <div className="h-full" style={{ width: `${pct}%`, background: pct === 100 ? "#5A8C6F" : "#C26F4A", transition: "width 200ms ease-out" }}></div>
    </div>
  );
}

function Card({ children, className = "", style }) {
  return (
    <div className={`rounded-lg border ${className}`} style={{ background: "#FFFFFF", borderColor: "#E8E6DE", ...(style || {}) }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, aside }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-[15px] font-semibold text-[#1A1A1A]">{children}</h3>
      {aside && <div className="text-[11px] text-[#8A8680] font-mono">{aside}</div>}
    </div>
  );
}

function IconBtn({ children, onClick, active, className = "" }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[12px] transition ${className}`}
      style={{
        borderColor: active ? "#C26F4A" : "#E8E6DE",
        background: active ? "#FBEFE8" : "#FFFFFF",
        color: active ? "#8F4E2C" : "#1A1A1A",
      }}>
      {children}
    </button>
  );
}

Object.assign(window, {
  TOKENS, STATUS_META, PRIORITY_META, HEALTH_COLORS, ATTACH_ICON,
  Pill, StatusPill, PriorityPill, Paperclip, Sparkle, AIButton, OnDeviceBadge,
  HealthDot, ProgressBar, Card, SectionTitle, IconBtn,
});
