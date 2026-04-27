// Retriever — Plan (project plan as a Git-managed file: docs/plan.md)

const PLAN_REPOS = [
  {
    id: "retriever",     name: "retriever",     branch: "feat/session-mgr-3b",
    plan_path: "docs/plan.md", head_sha: "8f3a91c", commits_to_plan: 7, last_edit: "2026-04-27 09:14",
    contributors: ["you", "codex_ci"],
    milestones: [
      { id: "M1", title: "Phase 3A — Schema + DB", due: "2026-04-15", status: "done",        progress: 1.0, tickets: 4 },
      { id: "M2", title: "Phase 3B — Session Manager",   due: "2026-05-04", status: "in_progress", progress: 0.55, tickets: 5 },
      { id: "M3", title: "Phase 3C — Export & Resume",   due: "2026-05-15", status: "todo",        progress: 0.0, tickets: 3 },
      { id: "M4", title: "Phase 4 — Multi-device sync",  due: "2026-06-01", status: "todo",        progress: 0.0, tickets: 6 },
    ],
    risks: [
      { sev: "med",  text: "Codex 어댑터 schema 변경 시 마이그레이션 부담", mitigation: "v2 schema 도입 시 nominal-version 룰 적용" },
      { sev: "high", text: "Tailscale 미연결 시 client write queue 누수",  mitigation: "30s flush + WAL persist 검증, M4 진입 전 부하 테스트" },
    ],
    decisions: [
      { id: "ADR-014", title: "session_uid는 (machine, harness, native_id)의 함수", date: "2026-04-22" },
      { id: "ADR-015", title: "Hub-only 2PC, client는 read-cache + write-queue", date: "2026-04-25" },
    ],
    plan_md: `# Retriever Project Plan

## Goals (Q2 2026)
1. 어떤 LLM 하네스든 **동일한 작업 컨텍스트**를 즉시 복원할 수 있다.
2. 데몬 한 개 + 하네스 어댑터 N개의 형태로 무한 확장.
3. 모든 상태는 **plain text(.md, .yaml)** 로 디스크에 보존.

## Non-Goals
- LLM을 직접 호출/오케스트레이션하지 않음 (그건 하네스의 일).
- 다중 사용자 / RBAC. (single-user, multi-device 만 다룸.)

## Phasing
### Phase 3A — Schema (done 2026-04-15)
- ticket / attachment / activity_event 테이블
- 마이그레이션 v1 → v2 안전 경로

### Phase 3B — Session Manager (in progress)
- 세션 캡처 (claude_code, codex)
- machine → repo → branch 위계
- resume id 노출

### Phase 3C — Export & Resume
- vault 단위 export (zip + manifest)
- 다른 머신에서 \`rtv session pull\`로 즉시 재개

### Phase 4 — Multi-device sync
- Tailscale 기반 client/hub 모델
- 오프라인 큐 + WAL persist`,
  },

  {
    id: "icube_quality", name: "icube-quality", branch: "main",
    plan_path: "docs/plan.md", head_sha: "1cf0a72", commits_to_plan: 3, last_edit: "2026-04-26 17:40",
    contributors: ["you"],
    milestones: [
      { id: "M1", title: "Rules v1 + R-D20 베이스라인",   due: "2026-04-10", status: "done",        progress: 1.0, tickets: 6 },
      { id: "M2", title: "False-positive 튜닝",           due: "2026-04-29", status: "in_progress", progress: 0.7, tickets: 3 },
      { id: "M3", title: "Rules v2 + 정합성 강화",         due: "2026-05-10", status: "todo",        progress: 0.0, tickets: 4 },
      { id: "M4", title: "알람 라우팅 (Google Chat)",       due: "2026-04-30", status: "blocked",     progress: 0.3, tickets: 2 },
    ],
    risks: [
      { sev: "high", text: "DB schema 변경 시 룰 마이그레이션 자동화 미비", mitigation: "ADR-012 적용 후 rule unit-test 확보" },
      { sev: "med",  text: "Google Chat webhook IP 화이트리스트 차단",       mitigation: "재무팀 협조 요청, 4/29 회신 대기" },
    ],
    decisions: [
      { id: "ADR-011", title: "거짓양성은 P1 이상에서만 알람",  date: "2026-04-12" },
      { id: "ADR-012", title: "룰 튜닝은 yaml 단일 파일",       date: "2026-04-15" },
    ],
    plan_md: `# iCUBE Quality Plan

## Goals
- 일일 데이터 품질 검증을 자동화한다.
- 잘못된 입력의 **당사자**에게만 알람을 보낸다 (소음 최소화).

## Phasing
- Rules v1 베이스라인 ✓
- False-positive 튜닝 (R-D20 중심)
- Rules v2 — 정합성 강화
- Google Chat 라우팅`,
  },

  {
    id: "wmux", name: "wmux", branch: "fix/namedpipe-ipc",
    plan_path: "docs/plan.md", head_sha: "a8c9210", commits_to_plan: 5, last_edit: "2026-04-20 22:12",
    contributors: ["you"],
    milestones: [
      { id: "M1", title: "POSIX backend (mac/linux)",      due: "2026-03-30", status: "done",     progress: 1.0, tickets: 8 },
      { id: "M2", title: "Windows NamedPipe IPC",          due: "2026-04-30", status: "blocked",  progress: 0.6, tickets: 4 },
      { id: "M3", title: "Termios 상태 보존",                due: "2026-05-09", status: "todo",     progress: 0.0, tickets: 3 },
    ],
    risks: [
      { sev: "high", text: "Windows kernel 동작 차이로 EAGAIN 누수 발생", mitigation: "재현 케이스 4종 정리, 4/28 커널팀 검토" },
    ],
    decisions: [
      { id: "ADR-007", title: "NamedPipe + ReadFile loop으로 멀티 클라이언트", date: "2026-04-12" },
    ],
    plan_md: `# wmux Plan

## Goals
- POSIX의 ttymux 사용 경험을 Windows에 그대로.
- 기능 1:1 호환 + Windows-native 안정성.

## Phasing
- POSIX backend ✓
- Windows NamedPipe IPC (현재)
- Termios 상태 보존`,
  },
];

const MILESTONE_STYLE = {
  done:        { color: "#5A8C6F", bg: "#E8F0EA", border: "#CADBCF" },
  in_progress: { color: "#C26F4A", bg: "#FBEFE8", border: "#EDD4C2" },
  todo:        { color: "#5C5A55", bg: "#F3F1EC", border: "#E0DDD3" },
  blocked:     { color: "#A83E3E", bg: "#F6E4E4", border: "#E4C4C4" },
};

const RISK_STYLE = {
  high: { color: "#A83E3E", bg: "#F6E4E4" },
  med:  { color: "#B89028", bg: "#F7EED6" },
  low:  { color: "#5A8C6F", bg: "#E8F0EA" },
};

function PlanView() {
  const [selected, setSelected] = React.useState("retriever");
  const [tab,      setTab]      = React.useState("milestones"); // milestones | source | risks
  const repo = PLAN_REPOS.find(r => r.id === selected) || PLAN_REPOS[0];

  return (
    <div>
      <div className="mb-5">
        <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>/ plan</div>
        <h1 className="text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-1">Project plan</h1>
        <p className="text-[13px] text-[#5C5A55] mt-1">프로젝트 계획서를 <span className="font-mono">git</span> 단위로 관리합니다 — 각 리포의 <span className="font-mono">docs/plan.md</span>가 단일 진실. Retriever는 마일스톤·리스크·결정을 추출해 표시합니다.</p>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-4">
        {/* Repo list */}
        <div className="space-y-2">
          {PLAN_REPOS.map(r => {
            const totalT = r.milestones.reduce((s, m) => s + m.tickets, 0);
            const doneM = r.milestones.filter(m => m.status === "done").length;
            const overall = r.milestones.reduce((s, m) => s + m.progress, 0) / r.milestones.length;
            const c = RM_PROJECT_COLOR[r.id] || "#A88467";
            const active = selected === r.id;
            return (
              <button key={r.id} onClick={() => setSelected(r.id)}
                className="w-full text-left p-3 rounded-md border transition"
                style={{
                  borderColor: active ? c : "#E8E6DE",
                  background: active ? "#FBEFE8" : "#FFFFFF",
                }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: c }}></span>
                  <span className="text-[13px] font-mono font-semibold text-[#1A1A1A]">{r.name}</span>
                  <span className="ml-auto text-[10px] font-mono" style={{ color: "#8A8680" }}>{r.head_sha}</span>
                </div>
                <div className="mt-1 text-[10px] font-mono" style={{ color: "#8A8680" }}>
                  ⎇ {r.branch} · {r.commits_to_plan} edits
                </div>
                <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "#F3F1EC" }}>
                  <div className="h-full" style={{ width: `${overall * 100}%`, background: c }}></div>
                </div>
                <div className="mt-1 text-[10px] font-mono flex justify-between" style={{ color: "#8A8680" }}>
                  <span>{doneM}/{r.milestones.length} milestones</span>
                  <span>{totalT} tickets</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <div className="min-w-0">
          <Card className="p-4 mb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[18px] font-semibold text-[#1A1A1A] font-mono">{repo.name}</h2>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#F3F1EC", color: "#5C5A55" }}>⎇ {repo.branch}</span>
                  <span className="text-[11px] font-mono" style={{ color: "#8A8680" }}>· {repo.head_sha}</span>
                </div>
                <div className="mt-1 text-[11px] font-mono break-all" style={{ color: "#8A8680" }}>
                  git://{repo.id}/{repo.plan_path} · last edit {repo.last_edit}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button className="text-[11px] font-mono px-2.5 py-1 rounded border"
                        style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: "#5C5A55" }}>git log -p plan</button>
                <button className="text-[11px] font-mono px-2.5 py-1 rounded border"
                        style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: "#5C5A55" }}>edit</button>
              </div>
            </div>
          </Card>

          <div className="flex border-b mb-3" style={{ borderColor: "#E8E6DE" }}>
            {[
              { id: "milestones", label: `Milestones (${repo.milestones.length})` },
              { id: "source",     label: "plan.md" },
              { id: "risks",      label: `Risks & Decisions (${repo.risks.length + repo.decisions.length})` },
            ].map(x => (
              <button key={x.id} onClick={() => setTab(x.id)}
                className="px-4 py-2.5 text-[12px] -mb-px border-b-2"
                style={{
                  borderColor: tab === x.id ? "#C26F4A" : "transparent",
                  color: tab === x.id ? "#1A1A1A" : "#5C5A55",
                  fontWeight: tab === x.id ? 600 : 400,
                }}>{x.label}</button>
            ))}
          </div>

          {tab === "milestones" && <MilestoneList repo={repo}/>}
          {tab === "source"     && <PlanSource    repo={repo}/>}
          {tab === "risks"      && <RisksAndDecisions repo={repo}/>}
        </div>
      </div>
    </div>
  );
}

function MilestoneList({ repo }) {
  return (
    <div className="space-y-2.5">
      {repo.milestones.map((m, i) => {
        const st = MILESTONE_STYLE[m.status];
        return (
          <Card key={m.id} className="p-3.5" style={{ borderLeft: `3px solid ${st.color}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: st.bg, color: st.color }}>{m.id}</span>
                  <span className="text-[14px] font-semibold text-[#1A1A1A]">{m.title}</span>
                  <span className="ml-auto text-[10px] font-mono" style={{ color: "#8A8680" }}>due {m.due}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#F3F1EC" }}>
                    <div className="h-full" style={{ width: `${m.progress * 100}%`, background: st.color }}></div>
                  </div>
                  <span className="text-[11px] font-mono w-10 text-right" style={{ color: "#5C5A55" }}>{Math.round(m.progress * 100)}%</span>
                  <span className="text-[10px] font-mono" style={{ color: "#8A8680" }}>{m.tickets} tickets</span>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function PlanSource({ repo }) {
  return (
    <Card className="p-0">
      <div className="px-4 py-2.5 border-b flex items-center justify-between text-[11px] font-mono"
           style={{ borderColor: "#E8E6DE", background: "#FDFCF7", color: "#8A8680" }}>
        <span>{repo.plan_path} · {repo.head_sha}</span>
        <span>{repo.contributors.join(" · ")}</span>
      </div>
      <pre className="p-4 text-[12px] font-mono leading-relaxed whitespace-pre-wrap text-[#1A1A1A]"
           style={{ background: "#FDFCF7" }}>{repo.plan_md}</pre>
    </Card>
  );
}

function RisksAndDecisions({ repo }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "#A83E3E" }}>risks</div>
        <div className="space-y-2">
          {repo.risks.map((r, i) => {
            const st = RISK_STYLE[r.sev];
            return (
              <Card key={i} className="p-3" style={{ borderLeft: `3px solid ${st.color}` }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: st.bg, color: st.color }}>{r.sev}</span>
                </div>
                <div className="text-[12px] text-[#1A1A1A]">{r.text}</div>
                <div className="mt-1.5 text-[11px]" style={{ color: "#5C5A55" }}>↳ {r.mitigation}</div>
              </Card>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "#5A8C6F" }}>decisions</div>
        <div className="space-y-2">
          {repo.decisions.map((d, i) => (
            <Card key={i} className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#E8F0EA", color: "#5A8C6F" }}>{d.id}</span>
                <span className="ml-auto text-[10px] font-mono" style={{ color: "#8A8680" }}>{d.date}</span>
              </div>
              <div className="text-[12px] text-[#1A1A1A]">{d.title}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PlanView });
