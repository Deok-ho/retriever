// Ticket Bundle Detail + Portfolio Dashboard

function TicketDetail({ taskId, openAgent }) {
  const t = TICKETS.find(x => x.task_id === taskId);
  const [tab, setTab] = React.useState("ticket");
  const [criteria, setCriteria] = React.useState(t.criteria || []);
  if (!t) return null;

  const atts = ATTACHMENTS[taskId] || [];
  const sum = SUMMARIES[taskId];
  const activity = ACTIVITY[taskId] || [
    { t: t.updated, kind: "update", text: "마지막 업데이트" },
    { t: t.created, kind: "create", text: "티켓 생성" },
  ];
  const toggle = (i) => setCriteria(cs => cs.map((c, j) => j === i ? { ...c, done: !c.done } : c));
  const verifyOne = (i) => openAgent(taskId, "verify_criterion", { index: i });

  return (
    <div>
      {/* Top header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 text-[11px] font-mono" style={{ color: "#8A8680" }}>
          <span>{t.project}</span>
          <span>/</span>
          <span>{t.task_id}</span>
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="text-[22px] font-semibold text-[#1A1A1A] leading-tight flex-1">{t.summary}</h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusPill status={t.status}/>
            <PriorityPill p={t.priority}/>
            <Paperclip count={t.attachments}/>
            <AIButton onClick={() => openAgent(t.task_id, "ask")}>Ask Agent</AIButton>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] font-mono" style={{ color: "#8A8680" }}>
          <span>created {t.created}</span>
          <span>·</span>
          <span>updated {t.updated}</span>
          {t.est_h && <><span>·</span><span>est {t.est_h}h</span></>}
          {t.actual_h && <><span>·</span><span>actual {t.actual_h}h</span></>}
          {t.blocked_reason && <><span>·</span><span style={{ color: "#A83E3E" }}>{t.blocked_reason}</span></>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b" style={{ borderColor: "#E8E6DE" }}>
        {[
          { id: "ticket", label: "Ticket" },
          { id: "attachments", label: `Attachments (${atts.length})` },
          { id: "summary", label: "AI Summary" },
        ].map(x => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className="px-4 py-2.5 text-[13px] -mb-px border-b-2"
            style={{
              borderColor: tab === x.id ? "#C26F4A" : "transparent",
              color: tab === x.id ? "#1A1A1A" : "#5C5A55",
              fontWeight: tab === x.id ? 600 : 400,
            }}>{x.label}</button>
        ))}
      </div>

      <div className="py-5">
        {tab === "ticket" && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="col-span-2 p-5">
              <div className="text-[11px] font-mono uppercase tracking-wider mb-3" style={{ color: "#8A8680" }}>ticket.md</div>
              <div className="text-[14px] leading-relaxed text-[#1A1A1A] whitespace-pre-wrap">{t.body}</div>

              {criteria.length > 0 && (
                <div className="mt-5 pt-4 border-t" style={{ borderColor: "#E8E6DE" }}>
                  <div className="text-[12px] font-semibold text-[#1A1A1A] mb-2">Completion criteria</div>
                  <div className="space-y-1.5">
                    {criteria.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-[#FAFAF7]">
                        <button onClick={() => toggle(i)} className="mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: c.done ? "#5A8C6F" : "#CFCCC2", background: c.done ? "#5A8C6F" : "#FFFFFF" }}>
                          {c.done && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5 L4 7.5 L8.5 2" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] ${c.done ? "text-[#8A8680] line-through" : "text-[#1A1A1A]"}`}>{c.text}</div>
                          {c.evidence && <div className="text-[11px] font-mono mt-0.5" style={{ color: "#5A8C6F" }}>✓ {c.evidence}</div>}
                        </div>
                        <button onClick={() => verifyOne(i)}
                          className="text-[11px] px-2 py-0.5 rounded border inline-flex items-center gap-1"
                          style={{ borderColor: "#EDD4C2", background: "#FBEFE8", color: "#8F4E2C" }}>
                          <Sparkle size={10}/> verify
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider mb-3" style={{ color: "#8A8680" }}>frontmatter</div>
              <dl className="grid grid-cols-[88px_1fr] gap-y-1.5 text-[12px]">
                <dt className="text-[#8A8680]">project</dt><dd className="font-mono text-[#1A1A1A]">{t.project}</dd>
                <dt className="text-[#8A8680]">task_id</dt><dd className="font-mono text-[#1A1A1A]">{t.task_id}</dd>
                <dt className="text-[#8A8680]">status</dt><dd><StatusPill status={t.status}/></dd>
                <dt className="text-[#8A8680]">priority</dt><dd><PriorityPill p={t.priority}/></dd>
                <dt className="text-[#8A8680]">task_type</dt><dd className="text-[#1A1A1A]">{t.task_type}</dd>
                <dt className="text-[#8A8680]">est_h</dt><dd className="font-mono text-[#1A1A1A]">{t.est_h ?? "—"}</dd>
                <dt className="text-[#8A8680]">actual_h</dt><dd className="font-mono text-[#1A1A1A]">{t.actual_h ?? "—"}</dd>
                {t.stalled_since && <><dt className="text-[#8A8680]">stalled_since</dt><dd className="font-mono" style={{ color: "#B89028" }}>{t.stalled_since}</dd></>}
              </dl>
            </Card>

            <Card className="col-span-3 p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider mb-3" style={{ color: "#8A8680" }}>activity timeline</div>
              <div className="space-y-0">
                {activity.map((e, i) => (
                  <div key={i} className="flex gap-3 py-2 border-b last:border-0" style={{ borderColor: "#F0EEE6" }}>
                    <span className="text-[11px] font-mono flex-shrink-0 w-32" style={{ color: "#8A8680" }}>{e.t}</span>
                    <span className="w-16 text-[11px] font-mono flex-shrink-0"
                      style={{ color: e.kind === "agent" ? "#C26F4A" : e.kind === "status" ? "#4A6B8A" : "#8A8680" }}>{e.kind}</span>
                    <span className="text-[12px] text-[#1A1A1A]">{e.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "attachments" && (
          <div className="space-y-3">
            <div className="rounded-lg border-2 border-dashed p-6 text-center text-[13px]"
                 style={{ borderColor: "#D9D6CB", color: "#8A8680", background: "#FDFCF7" }}>
              📎 파일을 여기에 끌어놓거나 URL을 붙여넣으세요 — 에이전트가 자동으로 타입 분류합니다
            </div>
            {atts.length === 0 && <div className="text-[12px] text-[#8A8680] px-1">아직 첨부가 없습니다.</div>}
            {atts.map(a => (
              <Card key={a.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center text-[14px] flex-shrink-0"
                       style={{ background: "#F3F1EC", color: "#5C5A55" }}>{ATTACH_ICON[a.kind] || "◯"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-mono text-[#1A1A1A]">{a.name}</span>
                      <Pill color="#5C5A55" bg="#F3F1EC" border="#E0DDD3" mono>{a.kind}</Pill>
                    </div>
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: "#8A8680" }}>{a.added} · {a.size}</div>
                    <div className="mt-2 text-[12px] text-[#3A3A36] leading-relaxed">{a.preview}</div>
                  </div>
                  <button className="text-[#B5B1A8] hover:text-[#A83E3E] p-1">🗑</button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === "summary" && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {sum && sum.fresh
                  ? <Pill color="#5A8C6F" bg="#E8F1EC" border="#CADBCF" mono>✓ Fresh</Pill>
                  : <Pill color="#B89028" bg="#F7EED6" border="#E5D5A5" mono>⟳ Stale</Pill>}
                <OnDeviceBadge/>
                <span className="text-[11px] font-mono" style={{ color: "#8A8680" }}>gemma4:26b-a4b-it-q8_0</span>
              </div>
              <button className="text-[12px] px-2.5 py-1 rounded border inline-flex items-center gap-1"
                      style={{ borderColor: "#EDD4C2", background: "#FBEFE8", color: "#8F4E2C" }}>
                <Sparkle size={11}/> 재생성
              </button>
            </div>
            {sum && !sum.fresh && sum.stale_reason && (
              <div className="rounded px-3 py-2 mb-3 text-[11px] font-mono" style={{ background: "#F7EED6", color: "#8C6D1E" }}>
                stale · {sum.stale_reason}
              </div>
            )}
            {sum ? (
              <>
                <div className="text-[14px] leading-relaxed text-[#1A1A1A]">{sum.body}</div>
                <div className="mt-4 pt-3 border-t text-[11px] font-mono" style={{ borderColor: "#E8E6DE", color: "#8A8680" }}>
                  regenerated at {sum.regenerated_at.slice(-5)} · {sum.attachments_count} attachments · {sum.tokens.toLocaleString()} tokens
                </div>
              </>
            ) : (
              <div className="text-[13px] text-[#8A8680] text-center py-8">아직 요약이 생성되지 않았습니다. 첨부를 추가하고 재생성하세요.</div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function Dashboard({ selectTicket, openAgent }) {
  const active  = TICKETS.filter(t => t.status === "in_progress").length;
  const stalled = TICKETS.filter(t => t.status === "stalled" || t.stalled_since).length;
  const doneWk  = TICKETS.filter(t => t.status === "done").length;
  const stalledList = TICKETS.filter(t => t.status === "stalled" || t.stalled_since);

  return (
    <div>
      <div className="mb-5">
        <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>/ dashboard</div>
        <h1 className="text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-1">Portfolio Dashboard</h1>
      </div>

      <Card className="p-5 mb-5" style={{ background: "#FDFCF7" }}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkle size={12}/>
          <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "#8A8680" }}>gemma4 — weekly narrative</span>
          <OnDeviceBadge/>
        </div>
        <p className="text-[14px] leading-relaxed text-[#1A1A1A]">{NARRATIVE_WEEK}</p>
      </Card>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard label="Active"          value={active}  sub="in progress"/>
        <KpiCard label="Stalled"         value={stalled} sub="3d+ no update" tone="#B89028"/>
        <KpiCard label="Done this week"  value={doneWk}  sub="since Mon"    tone="#5A8C6F"/>
        <KpiCard label="AI calls"        value={47}      sub="last 7d · Gemma4" tone="#C26F4A"/>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-4">
          <SectionTitle aside="last 7d · stacked by status">Status transitions</SectionTitle>
          <TransitionsChart data={STATUS_TRANSITIONS_7D}/>
          <div className="mt-3 flex items-center gap-3 text-[10px] font-mono" style={{ color: "#8A8680" }}>
            {Object.entries(STATUS_META).filter(([k]) => ["todo","in_progress","review","done","blocked"].includes(k)).map(([k,m]) => (
              <span key={k} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: m.color }}></span>{m.label}</span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle aside={`${stalledList.length}건`}>Stalled tickets</SectionTitle>
          <div className="space-y-2">
            {stalledList.map(t => (
              <div key={t.task_id} className="p-2.5 rounded border" style={{ borderColor: "#E5D5A5", background: "#FBF6E5" }}>
                <div className="flex items-center justify-between">
                  <button onClick={() => selectTicket(t.task_id)} className="text-[12px] font-mono text-[#1A1A1A] hover:text-[#C26F4A]">{t.project}/{t.task_id}</button>
                  <span className="text-[10px] font-mono" style={{ color: "#8C6D1E" }}>since {t.stalled_since}</span>
                </div>
                <div className="mt-1 text-[12px] text-[#3A3A36] line-clamp-2">{t.summary}</div>
                <button onClick={() => openAgent(t.task_id, "diagnose_stalled")}
                        className="mt-2 text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded border"
                        style={{ borderColor: "#EDD4C2", background: "#FBEFE8", color: "#8F4E2C" }}>
                  <Sparkle size={10}/> diagnose
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="col-span-3 p-4">
          <SectionTitle aside="health · WIP · last updated">Health by project</SectionTitle>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left" style={{ color: "#8A8680" }}>
                <th className="font-normal font-mono py-1.5">project</th>
                <th className="font-normal font-mono py-1.5">phase</th>
                <th className="font-normal font-mono py-1.5">health</th>
                <th className="font-normal font-mono py-1.5 text-right">active</th>
                <th className="font-normal font-mono py-1.5 text-right">stalled</th>
                <th className="font-normal font-mono py-1.5 text-right">done (7d)</th>
              </tr>
            </thead>
            <tbody>
              {PROJECTS.map(p => (
                <tr key={p.id} className="border-t" style={{ borderColor: "#F0EEE6" }}>
                  <td className="py-2 font-mono text-[#1A1A1A]">{p.id}</td>
                  <td className="py-2 font-mono" style={{ color: "#8A8680" }}>{p.phase}</td>
                  <td className="py-2"><HealthDot h={p.health}/> <span className="font-mono text-[11px] ml-1" style={{ color: HEALTH_COLORS[p.health] }}>{p.health}</span></td>
                  <td className="py-2 font-mono text-right text-[#1A1A1A]">{p.active}</td>
                  <td className="py-2 font-mono text-right" style={{ color: p.stalled > 0 ? "#B89028" : "#B5B1A8" }}>{p.stalled}</td>
                  <td className="py-2 font-mono text-right" style={{ color: "#5A8C6F" }}>{p.done_week}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, tone }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "#8A8680" }}>{label}</div>
      <div className="mt-2 text-[28px] font-semibold" style={{ color: tone || "#1A1A1A", letterSpacing: "-0.02em" }}>{value}</div>
      <div className="mt-1 text-[11px] font-mono" style={{ color: "#8A8680" }}>{sub}</div>
    </Card>
  );
}

function TransitionsChart({ data }) {
  const W = 520, H = 160, pad = 28;
  const keys = ["done", "review", "in_progress", "todo", "blocked"];
  const max = 10;
  const bw = (W - pad * 2) / data.length;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {[0, 2, 4, 6, 8, 10].map(y => (
        <line key={y} x1={pad} x2={W - pad} y1={H - pad - (y / max) * (H - pad * 2)} y2={H - pad - (y / max) * (H - pad * 2)} stroke="#EFECE3"/>
      ))}
      {data.map((d, i) => {
        let acc = 0;
        const x = pad + i * bw + bw * 0.2;
        const w = bw * 0.6;
        return (
          <g key={d.d}>
            {keys.map(k => {
              const v = d[k] || 0;
              const h = (v / max) * (H - pad * 2);
              const y = H - pad - acc - h;
              acc += h;
              return <rect key={k} x={x} y={y} width={w} height={h} fill={STATUS_META[k].color} opacity="0.88"/>;
            })}
            <text x={x + w / 2} y={H - pad + 14} fill="#8A8680" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono">{d.d}</text>
          </g>
        );
      })}
    </svg>
  );
}

Object.assign(window, { TicketDetail, Dashboard });
