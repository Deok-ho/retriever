// Retriever — Daemons (Tailscale fleet, hub/client 2PC sync)

const TS_DEVICES = [
  {
    id: "mac_studio",  hostname: "mac-studio.local", ts_ip: "100.64.0.12", os: "macOS 14.4",
    role: "hub+client", online: true, last_seen_ago: "now",
    daemon: { version: "0.1.0", uptime_s: 287_412, pid: 41203, port: 8731 },
    hub: {
      enabled: true,
      db_size_mb: 18.4,
      open_txns: 1,
      replicas_in_sync: 2, replicas_lagging: 1,
      last_compaction: "2026-04-26 03:12",
      hub_url: "http://100.64.0.12:8731/mcp",
    },
    client: {
      queue_depth: 0,        // hub-local writes need no queue
      cache_hit_rate: 0.94,
      last_flush: "now",
      sessions_today: 4,
    },
    harnesses: ["claude_code", "codex"],
  },
  {
    id: "mac_laptop", hostname: "mac-laptop.local", ts_ip: "100.64.0.34", os: "macOS 14.4",
    role: "client", online: true, last_seen_ago: "now",
    daemon: { version: "0.1.0", uptime_s: 14_220, pid: 8821, port: 8731 },
    client: {
      queue_depth: 0,
      cache_hit_rate: 0.81,
      last_flush: "2026-04-27 09:31",
      sessions_today: 2,
    },
    harnesses: ["claude_code", "codex"],
  },
  {
    id: "linux_dev",  hostname: "linux-dev",         ts_ip: "100.64.0.51", os: "Ubuntu 22.04",
    role: "client", online: true, last_seen_ago: "now",
    daemon: { version: "0.1.0", uptime_s: 902_310, pid: 24910, port: 8731 },
    client: {
      queue_depth: 3,                 // working through queue right now
      cache_hit_rate: 0.78,
      last_flush: "2026-04-27 09:18",
      sessions_today: 1,
      flushing: true,
    },
    harnesses: ["claude_code"],
  },
  {
    id: "win_desk",   hostname: "win-desk",          ts_ip: "100.64.0.77", os: "Windows 11",
    role: "client", online: false, last_seen_ago: "8h",
    daemon: { version: "0.0.9", uptime_s: 0, pid: null, port: 8731 },
    client: {
      queue_depth: 14,                // built up while offline
      cache_hit_rate: null,
      last_flush: "2026-04-26 22:04",
      sessions_today: 0,
      offline: true,
    },
    harnesses: ["claude_code"],
  },
];

// Live in-flight 2PC transactions across the fleet
const TS_TXNS = [
  {
    id: "tx_8f3a91c",
    initiator: "linux_dev",
    started: "2026-04-27 09:38:12",
    op: "rtv_create_ticket",
    payload_summary: "icube_quality / R-D20 false-positive 추가 케이스",
    phase: "commit",   // prepared | commit | aborted | committed
    participants: [
      { device: "mac_studio (hub)", vote: "yes", state: "committed" },
      { device: "mac_studio (replica)", vote: "yes", state: "committed" },
      { device: "linux_dev (origin)",   vote: "yes", state: "ack" },
    ],
  },
  {
    id: "tx_5b8d09a",
    initiator: "mac_laptop",
    started: "2026-04-27 09:38:31",
    op: "rtv_update_ticket",
    payload_summary: "wmux / namedpipe-ipc → status: blocked, reason 추가",
    phase: "prepared",
    participants: [
      { device: "mac_studio (hub)",      vote: "yes",     state: "prepared" },
      { device: "mac_studio (replica)",  vote: "yes",     state: "prepared" },
      { device: "mac_laptop (origin)",   vote: "pending", state: "awaiting" },
    ],
  },
  {
    id: "tx_e3a8f11",
    initiator: "win_desk",
    started: "2026-04-26 21:11:08",
    op: "rtv_capture_session",
    payload_summary: "vault / journal entry 2026-04-26 (queued · device offline)",
    phase: "queued",
    participants: [
      { device: "win_desk (origin)",     vote: "—",       state: "queued (offline)" },
    ],
  },
];

// Recent 2PC log entries
const TS_LOG = [
  { t: "09:38:12", level: "ok",   device: "linux_dev",  msg: "tx_8f3a91c · prepare → mac_studio · vote yes" },
  { t: "09:38:12", level: "ok",   device: "mac_studio", msg: "tx_8f3a91c · commit broadcast (3 participants)" },
  { t: "09:38:13", level: "ok",   device: "linux_dev",  msg: "tx_8f3a91c · ack · queue depth 4 → 3" },
  { t: "09:38:31", level: "info", device: "mac_laptop", msg: "tx_5b8d09a · prepare → mac_studio · awaiting commit" },
  { t: "09:36:02", level: "warn", device: "win_desk",   msg: "heartbeat missed (8h) · 14 ops queued locally" },
  { t: "09:31:44", level: "ok",   device: "mac_laptop", msg: "flushed 2 ops · queue 0" },
  { t: "09:18:07", level: "ok",   device: "linux_dev",  msg: "flushed 7 ops · queue 0 (now 3 newer ops)" },
  { t: "03:12:00", level: "info", device: "mac_studio", msg: "hub compaction complete · 22.1 MB → 18.4 MB" },
];

const PHASE_STYLE = {
  prepared:  { color: "#B89028", bg: "#F7EED6", label: "PREPARED" },
  commit:    { color: "#5A8C6F", bg: "#E8F0EA", label: "COMMITTING" },
  committed: { color: "#5A8C6F", bg: "#E8F0EA", label: "COMMITTED" },
  aborted:   { color: "#A83E3E", bg: "#F6E4E4", label: "ABORTED" },
  queued:    { color: "#8A8680", bg: "#F3F1EC", label: "QUEUED" },
};

const VOTE_STYLE = {
  yes:     { color: "#5A8C6F", glyph: "✓" },
  no:      { color: "#A83E3E", glyph: "✗" },
  pending: { color: "#B89028", glyph: "…" },
  "—":     { color: "#A8A8A0", glyph: "–" },
};

const LOG_LEVEL = {
  ok:   "#5A8C6F",
  info: "#5C5A55",
  warn: "#B89028",
  err:  "#A83E3E",
};

function fmtUptime(s) {
  if (!s) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h >= 24) { const d = Math.floor(h / 24); return `${d}d ${h % 24}h`; }
  return `${h}h ${m}m`;
}

function Daemons({ openAgent }) {
  const [selected, setSelected] = React.useState("mac_studio");
  const dev = TS_DEVICES.find(d => d.id === selected) || TS_DEVICES[0];

  const onlineCount = TS_DEVICES.filter(d => d.online).length;
  const totalQueued = TS_DEVICES.reduce((s, d) => s + (d.client?.queue_depth || 0), 0);
  const inflight    = TS_TXNS.filter(t => t.phase === "prepared" || t.phase === "commit").length;

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>/ daemons</div>
          <h1 className="text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-1">Daemons & sync</h1>
          <p className="text-[13px] text-[#5C5A55] mt-1 max-w-2xl">Tailscale로 묶인 디바이스에 <span className="font-mono">rtv-daemon</span>이 떠 있고, 이들이 <b>2PC</b>로 세션·티켓 변경을 합의합니다. <span className="font-mono">mac_studio</span>가 hub, 나머지는 client. 오프라인이면 큐에 쌓고, 다시 붙으면 한 번에 commit.</p>
        </div>
        <div className="flex gap-2">
          <Stat label="devices online" value={`${onlineCount}/${TS_DEVICES.length}`}/>
          <Stat label="in-flight 2PC"  value={inflight}/>
          <Stat label="queued ops"     value={totalQueued} warn={totalQueued > 5}/>
        </div>
      </div>

      {/* Tailnet topology */}
      <Card className="p-0 mb-4">
        <div className="px-4 py-2.5 border-b flex items-center justify-between"
             style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
          <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "#8A8680" }}>tailnet · paperclip-eorhgks.ts.net</div>
          <div className="text-[11px] font-mono" style={{ color: "#5C5A55" }}>hub <span className="text-[#1A1A1A]">100.64.0.12:8731</span></div>
        </div>
        <Topology devices={TS_DEVICES} selected={selected} onSelect={setSelected}/>
      </Card>

      <div className="grid grid-cols-[1fr_360px] gap-4">
        {/* Left: device list + transactions */}
        <div className="min-w-0 space-y-4">
          <Card className="p-0">
            <div className="px-4 py-2.5 border-b flex items-center justify-between"
                 style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
              <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "#8A8680" }}>devices</div>
              <div className="text-[11px] font-mono" style={{ color: "#5C5A55" }}>{TS_DEVICES.length} nodes</div>
            </div>
            <div>
              {TS_DEVICES.map(d => (
                <DeviceRow key={d.id} d={d} active={d.id === selected} onClick={() => setSelected(d.id)}/>
              ))}
            </div>
          </Card>

          <Card className="p-0">
            <div className="px-4 py-2.5 border-b flex items-center justify-between"
                 style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
              <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "#8A8680" }}>2-phase commit · in flight</div>
              <button onClick={() => openAgent && openAgent(null, "ask", { topic: "2pc" })}
                      className="text-[11px] font-mono"
                      style={{ color: "#8F4E2C" }}>ask agent ↗</button>
            </div>
            <div>
              {TS_TXNS.map(tx => <TxnRow key={tx.id} tx={tx}/>)}
            </div>
          </Card>
        </div>

        {/* Right: device detail + log */}
        <div className="min-w-0 space-y-4">
          <DeviceDetail dev={dev}/>
          <LogCard/>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }) {
  return (
    <div className="px-3 py-1.5 rounded-md border text-right"
         style={{ borderColor: "#E8E6DE", background: warn ? "#FBEFE8" : "#FFFFFF" }}>
      <div className="text-[10px] font-mono" style={{ color: "#8A8680" }}>{label}</div>
      <div className="text-[14px] font-mono font-semibold"
           style={{ color: warn ? "#C26F4A" : "#1A1A1A" }}>{value}</div>
    </div>
  );
}

function Topology({ devices, selected, onSelect }) {
  const W = 980, H = 220;
  const hub = devices.find(d => d.role.includes("hub"));
  const clients = devices.filter(d => !d.role.includes("hub"));

  // Hub at center; clients arranged on an arc
  const hubPos = { x: W / 2, y: H / 2 };
  const radius = 150;
  const angles = clients.map((_, i) => {
    const t = clients.length === 1 ? 0 : i / (clients.length - 1);
    return -Math.PI * 0.85 + t * Math.PI * 1.7;
  });
  const clientPos = clients.map((c, i) => ({
    x: hubPos.x + Math.cos(angles[i]) * radius,
    y: hubPos.y + Math.sin(angles[i]) * radius * 0.6,
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: 220, background: "#FDFCF7" }}>
      <defs>
        <pattern id="topo-grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#EBE8DE"/>
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#topo-grid)"/>

      {/* Tailscale ring (subtle ellipse to hint 'tailnet') */}
      <ellipse cx={hubPos.x} cy={hubPos.y} rx={radius + 24} ry={radius * 0.6 + 18}
               fill="none" stroke="#C7C3B8" strokeWidth={1} strokeDasharray="3 4"/>
      <text x={W - 8} y={16} fontSize="10" fontFamily="JetBrains Mono" fill="#A88467" textAnchor="end">100.64.0.0/10 · tailnet</text>

      {/* Connections */}
      {clients.map((c, i) => {
        const p = clientPos[i];
        const inflight = TS_TXNS.some(tx => tx.initiator === c.id && (tx.phase === "prepared" || tx.phase === "commit"));
        const stroke = !c.online ? "#C7C3B8" : inflight ? "#C26F4A" : "#A88467";
        const dash   = !c.online ? "3 4" : inflight ? "0" : "0";
        return (
          <g key={c.id}>
            <line x1={p.x} y1={p.y} x2={hubPos.x} y2={hubPos.y}
                  stroke={stroke} strokeWidth={inflight ? 1.5 : 1} strokeDasharray={dash}/>
            {inflight && (
              <circle r={3} fill="#C26F4A">
                <animateMotion dur="1.6s" repeatCount="indefinite"
                               path={`M ${p.x} ${p.y} L ${hubPos.x} ${hubPos.y}`}/>
              </circle>
            )}
            {c.client?.queue_depth > 0 && !inflight && (
              <text x={(p.x + hubPos.x) / 2} y={(p.y + hubPos.y) / 2 - 4}
                    fontSize="9" fontFamily="JetBrains Mono" fill="#B89028" textAnchor="middle">
                ⧖ {c.client.queue_depth} queued
              </text>
            )}
          </g>
        );
      })}

      {/* Hub node */}
      <TopoNode pos={hubPos} dev={hub} hub onClick={() => onSelect(hub.id)} active={selected === hub.id}/>

      {/* Client nodes */}
      {clients.map((c, i) => (
        <TopoNode key={c.id} pos={clientPos[i]} dev={c} onClick={() => onSelect(c.id)} active={selected === c.id}/>
      ))}
    </svg>
  );
}

function TopoNode({ pos, dev, hub, active, onClick }) {
  const r = hub ? 36 : 28;
  const fill = !dev.online ? "#F3F1EC" : hub ? "#FBEFE8" : "#FFFFFF";
  const stroke = active ? "#C26F4A" : !dev.online ? "#C7C3B8" : hub ? "#C26F4A" : "#A88467";
  return (
    <g style={{ cursor: "pointer" }} onClick={onClick}>
      <circle cx={pos.x} cy={pos.y} r={r} fill={fill} stroke={stroke} strokeWidth={active ? 2 : 1.2}/>
      {dev.online && (
        <circle cx={pos.x + r - 6} cy={pos.y - r + 6} r={4}
                fill={dev.client?.queue_depth > 0 ? "#B89028" : "#5A8C6F"}/>
      )}
      <text x={pos.x} y={pos.y - 2} fontSize="11" fontFamily="JetBrains Mono" fontWeight="600"
            fill="#1A1A1A" textAnchor="middle">{dev.id}</text>
      <text x={pos.x} y={pos.y + 12} fontSize="9" fontFamily="JetBrains Mono"
            fill="#5C5A55" textAnchor="middle">{dev.ts_ip}</text>
      {hub && (
        <text x={pos.x} y={pos.y + r + 14} fontSize="9" fontFamily="JetBrains Mono" fontWeight="600"
              fill="#C26F4A" textAnchor="middle">HUB · {dev.daemon.port}</text>
      )}
      {!dev.online && (
        <text x={pos.x} y={pos.y + r + 14} fontSize="9" fontFamily="JetBrains Mono"
              fill="#A88467" textAnchor="middle">offline · {dev.last_seen_ago}</text>
      )}
    </g>
  );
}

function DeviceRow({ d, active, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b transition"
      style={{ borderColor: "#F2F0E9", background: active ? "#FBEFE8" : "transparent" }}>
      {/* Status pip */}
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: !d.online ? "#C7C3B8" : d.client?.queue_depth > 0 ? "#B89028" : "#5A8C6F" }}/>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-mono font-semibold text-[#1A1A1A]">{d.id}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ background: d.role.includes("hub") ? "#FBEFE8" : "#F3F1EC",
                         color:      d.role.includes("hub") ? "#8F4E2C" : "#5C5A55" }}>
            {d.role}
          </span>
          <span className="text-[10px] font-mono" style={{ color: "#8A8680" }}>{d.os}</span>
        </div>
        <div className="text-[10px] font-mono mt-0.5" style={{ color: "#8A8680" }}>
          {d.hostname} · {d.ts_ip} · uptime {fmtUptime(d.daemon.uptime_s)}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-[11px] font-mono"
             style={{ color: d.client?.queue_depth > 0 ? "#B89028" : "#5C5A55" }}>
          {d.client?.queue_depth || 0} queued
        </div>
        <div className="text-[9px] font-mono" style={{ color: "#8A8680" }}>
          {d.client?.cache_hit_rate != null ? `cache ${Math.round(d.client.cache_hit_rate * 100)}%` : "—"}
        </div>
      </div>
    </button>
  );
}

function TxnRow({ tx }) {
  const ph = PHASE_STYLE[tx.phase];
  return (
    <div className="px-4 py-3 border-b" style={{ borderColor: "#F2F0E9" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold"
              style={{ background: ph.bg, color: ph.color }}>{ph.label}</span>
        <span className="text-[12px] font-mono font-semibold text-[#1A1A1A]">{tx.id}</span>
        <span className="text-[11px] font-mono" style={{ color: "#5C5A55" }}>· {tx.op}</span>
        <span className="ml-auto text-[10px] font-mono" style={{ color: "#8A8680" }}>{tx.started}</span>
      </div>
      <div className="mt-1.5 text-[12px] text-[#3A3A36]">{tx.payload_summary}</div>

      {/* Vote tally */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {tx.participants.map((p, i) => {
          const v = VOTE_STYLE[p.vote] || VOTE_STYLE["—"];
          return (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border"
                  style={{ borderColor: "#E8E6DE", background: "#FDFCF7", color: "#5C5A55" }}>
              <span style={{ color: v.color, fontWeight: 600 }}>{v.glyph}</span>
              <span className="text-[#1A1A1A]">{p.device}</span>
              <span style={{ color: "#8A8680" }}>· {p.state}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function DeviceDetail({ dev }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full"
              style={{ background: !dev.online ? "#C7C3B8" : "#5A8C6F" }}/>
        <h3 className="text-[14px] font-semibold text-[#1A1A1A] font-mono">{dev.id}</h3>
        <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: dev.role.includes("hub") ? "#FBEFE8" : "#F3F1EC",
                       color:      dev.role.includes("hub") ? "#8F4E2C" : "#5C5A55" }}>
          {dev.role}
        </span>
      </div>

      <KV k="hostname"  v={dev.hostname}/>
      <KV k="tailscale" v={dev.ts_ip}/>
      <KV k="os"        v={dev.os}/>
      <KV k="daemon"    v={`v${dev.daemon.version} · pid ${dev.daemon.pid ?? "—"} · :${dev.daemon.port}`}/>
      <KV k="uptime"    v={fmtUptime(dev.daemon.uptime_s)}/>
      <KV k="harnesses" v={dev.harnesses.join(", ")}/>

      {dev.hub && (
        <>
          <Section title="hub"/>
          <KV k="db"          v={`${dev.hub.db_size_mb} MB`}/>
          <KV k="hub_url"     v={dev.hub.hub_url} mono/>
          <KV k="open txns"   v={dev.hub.open_txns}/>
          <KV k="replicas"    v={`${dev.hub.replicas_in_sync} in-sync · ${dev.hub.replicas_lagging} lagging`}/>
          <KV k="last compact" v={dev.hub.last_compaction}/>
        </>
      )}

      <Section title="client"/>
      <KV k="queue depth"  v={dev.client.queue_depth}
          warn={dev.client.queue_depth > 5} ok={dev.client.queue_depth === 0}/>
      <KV k="cache hit"    v={dev.client.cache_hit_rate != null ? `${Math.round(dev.client.cache_hit_rate * 100)}%` : "—"}/>
      <KV k="last flush"   v={dev.client.last_flush}/>
      <KV k="sessions/day" v={dev.client.sessions_today}/>

      <div className="mt-4 pt-3 border-t flex gap-2" style={{ borderColor: "#E8E6DE" }}>
        <button className="text-[11px] font-mono px-2.5 py-1 rounded border flex-1"
                style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: "#5C5A55" }}>
          rtv daemon flush
        </button>
        <button className="text-[11px] font-mono px-2.5 py-1 rounded border flex-1"
                style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: "#5C5A55" }}>
          {dev.online ? "restart" : "wake"}
        </button>
      </div>
    </Card>
  );
}

function Section({ title }) {
  return (
    <div className="mt-3 mb-1.5 text-[10px] font-mono uppercase tracking-wider"
         style={{ color: "#A88467" }}>{title}</div>
  );
}

function KV({ k, v, mono, warn, ok }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
      <span className="font-mono" style={{ color: "#8A8680" }}>{k}</span>
      <span className={mono ? "font-mono" : "font-mono"}
            style={{ color: warn ? "#B89028" : ok ? "#5A8C6F" : "#1A1A1A",
                     wordBreak: "break-all", textAlign: "right" }}>{v}</span>
    </div>
  );
}

function LogCard() {
  return (
    <Card className="p-0">
      <div className="px-4 py-2.5 border-b flex items-center justify-between"
           style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
        <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "#8A8680" }}>2pc log · last 30m</div>
        <span className="text-[10px] font-mono" style={{ color: "#5C5A55" }}>tail -f</span>
      </div>
      <div className="p-3 space-y-1 text-[11px] font-mono"
           style={{ background: "#FDFCF7", maxHeight: 240, overflowY: "auto" }}>
        {TS_LOG.map((l, i) => (
          <div key={i} className="flex gap-2">
            <span style={{ color: "#A88467" }}>{l.t}</span>
            <span style={{ color: LOG_LEVEL[l.level], width: 36 }}>[{l.level}]</span>
            <span style={{ color: "#5C5A55", width: 76 }}>{l.device}</span>
            <span className="text-[#1A1A1A] flex-1">{l.msg}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

Object.assign(window, { Daemons });
