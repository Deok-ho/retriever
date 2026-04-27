// Config Drift — Harness + K8s anomalies

const DRIFT_SERVICES = [
  {
    name: "icube-quality-api", repo: "icube-quality", owner: "park.kyeongil",
    envs: ["dev", "stg", "prod"],
    issues: [
      { sev: "P0", type: "live_vs_git", env: "prod", field: "image.tag",
        desired: "v1.8.2", actual: "v1.8.0-hotfix.3", detected: "2026-04-25 07:12",
        explain: "라이브 클러스터 이미지가 git 선언보다 구 버전 + hotfix 커밋. 롤백 후 재배포 누락." },
      { sev: "P1", type: "env_diff", field: "resources.limits.memory",
        values: { dev: "512Mi", stg: "512Mi", prod: "256Mi" },
        explain: "prod 메모리 리밋이 하위 환경보다 낮음 — OOM 위험." },
      { sev: "P1", type: "policy", rule: "kyverno/require-run-as-non-root", env: "prod",
        explain: "securityContext.runAsNonRoot 미설정. 정책 enforce 모드 전환 예정(5/1)." },
    ],
  },
  {
    name: "retriever-indexer", repo: "retriever", owner: "park.kyeongil",
    envs: ["dev", "stg"],
    issues: [
      { sev: "P2", type: "env_diff", field: "replicaCount",
        values: { dev: "1", stg: "3" }, explain: "HPA 활성 전 과도 설정 — 비용 불필요." },
    ],
  },
  {
    name: "wmux-ipc-bridge", repo: "wmux", owner: "park.kyeongil",
    envs: ["dev"],
    issues: [
      { sev: "P0", type: "policy", rule: "opa/deny-privileged", env: "dev",
        explain: "privileged: true — 커널 호출 디버깅 중 남겨둔 설정. 4/28 커널팀 리뷰 후 제거 예정." },
      { sev: "P1", type: "live_vs_git", env: "dev", field: "env.LOG_LEVEL",
        desired: "info", actual: "trace", detected: "2026-04-24 18:40",
        explain: "kubectl patch로 수동 변경된 상태. GitOps 규칙 위반." },
    ],
  },
  {
    name: "mbo-tally", repo: "mbo_tally", owner: "park.kyeongil",
    envs: ["dev"], issues: [],
  },
];

const SEV_STYLE = {
  P0: { color: "#A83E3E", bg: "#F6E4E4", border: "#E4C4C4" },
  P1: { color: "#B89028", bg: "#F7EED6", border: "#E5D5A5" },
  P2: { color: "#8A8680", bg: "#F3F1EC", border: "#E0DDD3" },
};

const TYPE_LABEL = {
  live_vs_git: "Live vs Git drift",
  env_diff:    "Environment diff",
  policy:      "Policy violation",
};

function ConfigDrift({ openAgent }) {
  const [mode, setMode] = React.useState("services"); // services | matrix
  const [selected, setSelected] = React.useState("icube-quality-api");
  const svc = DRIFT_SERVICES.find(s => s.name === selected) || DRIFT_SERVICES[0];
  const counts = { P0: 0, P1: 0, P2: 0 };
  DRIFT_SERVICES.forEach(s => s.issues.forEach(i => counts[i.sev]++));

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>/ config-drift</div>
          <h1 className="text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-1">Config drift</h1>
          <p className="text-[13px] text-[#5C5A55] mt-1">Harness override · K8s live state · OPA/Kyverno 위반을 한 곳에서 확인합니다. 3시간 주기로 스냅샷.</p>
        </div>
        <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: "#E8E6DE" }}>
          {[["services", "Services"], ["matrix", "Env Matrix"]].map(([v, l], i) => (
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

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[["P0", counts.P0, "즉시 조치"], ["P1", counts.P1, "24h 내"], ["P2", counts.P2, "정기 리뷰"], ["Last scan", "07:12", "3h 전"]].map(([k, v, s], i) => {
          const sev = SEV_STYLE[k];
          return (
            <Card key={i} className="p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "#8A8680" }}>{k}</div>
              <div className="mt-2 text-[28px] font-semibold" style={{ color: sev ? sev.color : "#1A1A1A", letterSpacing: "-0.02em" }}>{v}</div>
              <div className="mt-1 text-[11px] font-mono" style={{ color: "#8A8680" }}>{s}</div>
            </Card>
          );
        })}
      </div>

      {mode === "services" ? (
        <div className="grid grid-cols-[260px_1fr] gap-4">
          {/* Service list */}
          <Card className="p-2">
            {DRIFT_SERVICES.map(s => {
              const top = s.issues[0]?.sev;
              const active = selected === s.name;
              return (
                <button key={s.name} onClick={() => setSelected(s.name)}
                  className="w-full text-left p-2.5 rounded-md mb-1 flex items-center justify-between gap-2 transition"
                  style={{ background: active ? "#FBEFE8" : "transparent" }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-mono text-[#1A1A1A] truncate">{s.name}</div>
                    <div className="text-[10px] font-mono mt-0.5" style={{ color: "#8A8680" }}>{s.repo} · {s.envs.join(" · ")}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {s.issues.length === 0
                      ? <span className="text-[10px] font-mono" style={{ color: "#5A8C6F" }}>✓</span>
                      : <span className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded"
                              style={{ color: SEV_STYLE[top].color, background: SEV_STYLE[top].bg }}>
                          {s.issues.length}
                        </span>}
                  </div>
                </button>
              );
            })}
          </Card>

          {/* Detail */}
          <div>
            <Card className="p-4 mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>{svc.repo} · owner {svc.owner}</div>
                  <h2 className="text-[18px] font-semibold text-[#1A1A1A] mt-0.5">{svc.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {svc.envs.map(e => <span key={e} className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: "#F3F1EC", color: "#5C5A55" }}>{e}</span>)}
                </div>
              </div>
            </Card>

            {svc.issues.length === 0 ? (
              <Card className="p-10 text-center">
                <div className="text-[14px]" style={{ color: "#5A8C6F" }}>✓ drift 없음</div>
                <div className="text-[11px] font-mono mt-1" style={{ color: "#8A8680" }}>마지막 스캔 07:12 · 3h 전</div>
              </Card>
            ) : (
              <div className="space-y-3">
                {svc.issues.map((iss, i) => <IssueCard key={i} iss={iss} svc={svc} openAgent={openAgent}/>)}
              </div>
            )}
          </div>
        </div>
      ) : (
        <EnvMatrix/>
      )}
    </div>
  );
}

function IssueCard({ iss, svc, openAgent }) {
  const sev = SEV_STYLE[iss.sev];
  return (
    <Card className="p-4" style={{ borderLeft: `3px solid ${sev.color}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ color: sev.color, background: sev.bg }}>
              <span className="w-1 h-1 rounded-full" style={{ background: sev.color }}></span>{iss.sev}
            </span>
            <span className="text-[11px] font-mono" style={{ color: "#5C5A55" }}>{TYPE_LABEL[iss.type]}</span>
            {iss.env  && <span className="text-[11px] font-mono px-1.5 rounded" style={{ background: "#F3F1EC", color: "#5C5A55" }}>{iss.env}</span>}
            {iss.field && <span className="text-[11px] font-mono" style={{ color: "#8A8680" }}>· {iss.field}</span>}
            {iss.rule  && <span className="text-[11px] font-mono" style={{ color: "#8A8680" }}>· {iss.rule}</span>}
          </div>

          <div className="mt-2 text-[13px] text-[#1A1A1A]">{iss.explain}</div>

          {/* Visual per type */}
          {iss.type === "live_vs_git" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded border p-2.5" style={{ borderColor: "#CADBCF", background: "#F1F7F3" }}>
                <div className="text-[10px] font-mono" style={{ color: "#5A8C6F" }}>DESIRED (git)</div>
                <div className="mt-1 font-mono text-[13px] text-[#1A1A1A]">{iss.desired}</div>
              </div>
              <div className="rounded border p-2.5" style={{ borderColor: "#E4C4C4", background: "#FBECEC" }}>
                <div className="text-[10px] font-mono" style={{ color: "#A83E3E" }}>ACTUAL (live)</div>
                <div className="mt-1 font-mono text-[13px] text-[#1A1A1A]">{iss.actual}</div>
              </div>
            </div>
          )}

          {iss.type === "env_diff" && iss.values && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Object.entries(iss.values).map(([env, val], i, all) => {
                const vals = all.map(([, v]) => v);
                const isOut = vals.filter(v => v !== val).length === 0 ? false : vals.filter(v => v === val).length === 1;
                return (
                  <div key={env} className="rounded border p-2.5"
                       style={{ borderColor: isOut ? "#E5D5A5" : "#E8E6DE", background: isOut ? "#FBF6E5" : "#FAFAF7" }}>
                    <div className="text-[10px] font-mono" style={{ color: "#8A8680" }}>{env}</div>
                    <div className="mt-1 font-mono text-[13px] text-[#1A1A1A]">{val}{isOut && <span className="ml-1" style={{ color: "#B89028" }}>⚠</span>}</div>
                  </div>
                );
              })}
            </div>
          )}

          {iss.type === "policy" && (
            <div className="mt-3 rounded border p-2.5 font-mono text-[12px]"
                 style={{ borderColor: "#E4C4C4", background: "#FBECEC", color: "#3A3A36" }}>
              <span style={{ color: "#A83E3E" }}>DENY</span> — {iss.rule}
              <div className="text-[11px] mt-1" style={{ color: "#8A8680" }}>apiVersion · {svc.name}/{iss.env}</div>
            </div>
          )}

          {iss.detected && <div className="mt-2 text-[10px] font-mono" style={{ color: "#8A8680" }}>detected {iss.detected}</div>}
        </div>

        <div className="flex-shrink-0 flex flex-col gap-1.5">
          <AIButton onClick={() => openAgent("auditor_false_positives", "ask", { topic: iss.field || iss.rule })}>ask</AIButton>
          <button className="text-[11px] px-2.5 py-1 rounded border"
                  style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: "#5C5A55" }}>ticket</button>
        </div>
      </div>
    </Card>
  );
}

function EnvMatrix() {
  // Flatten: services × envs × fields of interest
  const rows = [];
  DRIFT_SERVICES.forEach(s => {
    s.issues.filter(i => i.type === "env_diff" && i.values).forEach(i => {
      rows.push({ svc: s.name, field: i.field, sev: i.sev, values: i.values });
    });
    s.issues.filter(i => i.type === "live_vs_git").forEach(i => {
      rows.push({ svc: s.name, field: i.field + " (live)", sev: i.sev, values: { [i.env]: `${i.actual}  ≠  ${i.desired}` }, drift: true });
    });
  });
  const allEnvs = ["dev", "stg", "prod"];

  return (
    <Card className="p-0 overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ background: "#FAFAF7" }}>
            <th className="text-left font-mono font-normal px-3 py-2.5 text-[11px]" style={{ color: "#8A8680" }}>service</th>
            <th className="text-left font-mono font-normal px-3 py-2.5 text-[11px]" style={{ color: "#8A8680" }}>field</th>
            {allEnvs.map(e => <th key={e} className="text-left font-mono font-normal px-3 py-2.5 text-[11px]" style={{ color: "#8A8680" }}>{e}</th>)}
            <th className="text-right font-mono font-normal px-3 py-2.5 text-[11px]" style={{ color: "#8A8680" }}>sev</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const vals = Object.values(r.values);
            const allSame = vals.length > 1 && vals.every(v => v === vals[0]);
            return (
              <tr key={i} className="border-t" style={{ borderColor: "#F0EEE6" }}>
                <td className="px-3 py-2.5 font-mono text-[#1A1A1A]">{r.svc}</td>
                <td className="px-3 py-2.5 font-mono" style={{ color: "#3A3A36" }}>{r.field}</td>
                {allEnvs.map(e => {
                  const v = r.values[e];
                  const isDrift = r.drift && v;
                  const isOutlier = !allSame && v && Object.values(r.values).filter(x => x === v).length === 1;
                  return (
                    <td key={e} className="px-3 py-2.5 font-mono text-[11px]"
                        style={{
                          background: isDrift ? "#FBECEC" : isOutlier ? "#FBF6E5" : "transparent",
                          color: isDrift ? "#A83E3E" : "#1A1A1A",
                        }}>{v || <span style={{ color: "#C7C3B8" }}>—</span>}</td>
                  );
                })}
                <td className="px-3 py-2.5 text-right">
                  <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{ color: SEV_STYLE[r.sev].color, background: SEV_STYLE[r.sev].bg }}>{r.sev}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

Object.assign(window, { ConfigDrift });
