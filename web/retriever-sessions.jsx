// Retriever — Session Browser (Phase 3B)
// Hierarchy: machine → repo (git) → branch → session
// Each session row exposes a "resume id" — the harness-specific command to continue it elsewhere.

const SB_MACHINES = [
  {
    id: "mac_studio",  label: "mac-studio.local",   role: "primary", os: "macOS 14.4",
    last_seen: "2026-04-27 09:42", sessions: 31, bytes: 184 * 1024 * 1024,
  },
  {
    id: "mac_laptop",  label: "mac-laptop.local",   role: "mobile",  os: "macOS 14.4",
    last_seen: "2026-04-26 22:18", sessions: 19, bytes: 92 * 1024 * 1024,
  },
  {
    id: "linux_dev",   label: "linux-dev.icube",    role: "remote",  os: "Ubuntu 22.04",
    last_seen: "2026-04-27 04:01", sessions: 12, bytes: 41 * 1024 * 1024,
  },
];

const SB_REPOS = [
  // mac_studio
  { id: "retriever@mac_studio",        machine: "mac_studio", name: "retriever",        path: "~/dev/personal/retriever",    head: "feat/session-mgr-3b", commits_today: 4 },
  { id: "icube-quality@mac_studio",    machine: "mac_studio", name: "icube-quality",    path: "~/dev/work/icube-quality",    head: "main",                commits_today: 1 },
  { id: "wmux@mac_studio",             machine: "mac_studio", name: "wmux",             path: "~/dev/personal/wmux",         head: "fix/namedpipe-ipc",   commits_today: 2 },
  { id: "vault@mac_studio",            machine: "mac_studio", name: "(vault, no-git)",  path: "~/Obsidian/vault",            head: null,                  commits_today: 0 },
  // mac_laptop
  { id: "retriever@mac_laptop",        machine: "mac_laptop", name: "retriever",        path: "~/dev/retriever",             head: "main",                commits_today: 0 },
  { id: "mbo_tally@mac_laptop",        machine: "mac_laptop", name: "mbo_tally",        path: "~/dev/mbo_tally",             head: "main",                commits_today: 1 },
  // linux_dev
  { id: "icube-quality@linux_dev",     machine: "linux_dev",  name: "icube-quality",    path: "~/srv/icube-quality",         head: "feat/rule-tuning",    commits_today: 3 },
];

const SB_BRANCHES = [
  // retriever@mac_studio
  { id: "feat/session-mgr-3b@retriever@mac_studio", repo: "retriever@mac_studio",     name: "feat/session-mgr-3b", current: true,  ahead: 7, behind: 0 },
  { id: "main@retriever@mac_studio",                repo: "retriever@mac_studio",     name: "main",                current: false, ahead: 0, behind: 7 },
  { id: "perf/collector@retriever@mac_studio",      repo: "retriever@mac_studio",     name: "perf/collector",      current: false, ahead: 3, behind: 12, stale_days: 4 },
  // icube-quality@mac_studio
  { id: "main@icube-quality@mac_studio",            repo: "icube-quality@mac_studio", name: "main",                current: true,  ahead: 0, behind: 0 },
  // wmux
  { id: "fix/namedpipe-ipc@wmux@mac_studio",        repo: "wmux@mac_studio",          name: "fix/namedpipe-ipc",   current: true,  ahead: 4, behind: 0 },
  { id: "main@wmux@mac_studio",                     repo: "wmux@mac_studio",          name: "main",                current: false, ahead: 0, behind: 4 },
  // vault
  { id: "(no-branch)@vault@mac_studio",             repo: "vault@mac_studio",         name: "(no-branch)",         current: true,  ahead: 0, behind: 0 },
  // mac_laptop / linux
  { id: "main@retriever@mac_laptop",                repo: "retriever@mac_laptop",     name: "main",                current: true,  ahead: 0, behind: 7 },
  { id: "main@mbo_tally@mac_laptop",                repo: "mbo_tally@mac_laptop",     name: "main",                current: true,  ahead: 1, behind: 0 },
  { id: "feat/rule-tuning@icube-quality@linux_dev", repo: "icube-quality@linux_dev",  name: "feat/rule-tuning",    current: true,  ahead: 5, behind: 1 },
];

const SB_SESSIONS = [
  // retriever@mac_studio · feat/session-mgr-3b
  {
    uid: "mac_studio:claude_code:0a1f3c2e",
    branch: "feat/session-mgr-3b@retriever@mac_studio",
    harness: "claude_code", native_id: "0a1f3c2e-a4d2-49b8-9bc0-72e",
    started_at: "2026-04-27 08:14", last_active: "2026-04-27 09:38", ended_at: null,
    status: "active",
    summary: "Phase 3B 세션 매니저 스키마 v2 작성 (sessions / transcripts / events / files_touched / analysis / links).",
    goal:    "구현 전 1회 설계 분석 — DB 스키마, MCP 툴, 수집 흐름 합의",
    outcome: "in_progress",
    tools: { Edit: 14, Read: 22, Write: 3, Bash: 5, "rtv_*": 8 },
    files: ["src/db/migrations/0002_sessions.sql", "src/server/sessionRepo.ts", "docs/phase3b-spec.md"],
    events: 184, active_seconds: 4_320, total_seconds: 5_080, errors: 1,
    commit_shas: ["c4f1ae9", "7d3b021"],
    tickets: [{ ticket: "session_manager_3b", project: "retriever", confidence: 1.0 }],
  },
  {
    uid: "mac_studio:claude_code:5b8d09a7",
    branch: "feat/session-mgr-3b@retriever@mac_studio",
    harness: "claude_code", native_id: "5b8d09a7-1f44-46ea-8c63-92a",
    started_at: "2026-04-26 21:02", last_active: "2026-04-26 23:48", ended_at: "2026-04-26 23:55",
    status: "archived",
    summary: "git post-commit hook 스파이크. 백그라운드 detach 검증, 다른 hook 충돌 처리 정책.",
    goal:    "트리거 메커니즘 PoC",
    outcome: "completed",
    tools: { Edit: 6, Read: 9, Bash: 18 },
    files: ["src/cli/git-hook.ts", "scripts/install-hook.sh"],
    events: 92, active_seconds: 2_640, total_seconds: 9_960, errors: 0,
    commit_shas: ["7d3b021"],
    tickets: [{ ticket: "session_manager_3b", project: "retriever", confidence: 0.92 }],
  },
  {
    uid: "mac_studio:codex:s_2026_04_25_a",
    branch: "perf/collector@retriever@mac_studio",
    harness: "codex", native_id: "s_2026_04_25_a",
    started_at: "2026-04-23 14:05", last_active: "2026-04-23 16:40", ended_at: "2026-04-23 16:48",
    status: "archived",
    summary: "collector 점진 인덱싱 — incremental walk + content_hash 캐시.",
    goal:    "collector 성능 개선",
    outcome: "stalled",
    tools: { Edit: 8, Read: 12, Bash: 4 },
    files: ["src/collector.ts", "src/cache/hash.ts"],
    events: 71, active_seconds: 3_180, total_seconds: 9_180, errors: 3,
    commit_shas: [],
    tickets: [],
  },
  // icube-quality@mac_studio
  {
    uid: "mac_studio:codex:s_2026_04_17_b",
    branch: "main@icube-quality@mac_studio",
    harness: "codex", native_id: "s_2026_04_17_b",
    started_at: "2026-04-17 11:20", last_active: "2026-04-17 14:08", ended_at: "2026-04-17 14:12",
    status: "archived",
    summary: "ADR-012 룰 튜닝. R-D20 거짓 양성 분석, threshold 조정 후 회귀 비교.",
    goal:    "auditor false-positive 감축",
    outcome: "completed",
    tools: { Edit: 9, Read: 18, Bash: 11 },
    files: ["rules/R-D20.sql", "tests/fixtures/auditor.csv", "docs/ADR-012.md"],
    events: 142, active_seconds: 5_640, total_seconds: 10_080, errors: 2,
    commit_shas: ["b2e4f10"],
    tickets: [{ ticket: "auditor_false_positives", project: "icube_quality", confidence: 1.0 }],
  },
  // wmux
  {
    uid: "mac_studio:claude_code:f7c2a013",
    branch: "fix/namedpipe-ipc@wmux@mac_studio",
    harness: "claude_code", native_id: "f7c2a013-99ee-4a02-a7e1-04d",
    started_at: "2026-04-20 19:30", last_active: "2026-04-20 22:12", ended_at: null,
    status: "idle",
    summary: "named-pipe IPC 권한 이슈 디버깅 — privileged: true 임시 활성화 필요.",
    goal:    "wmux IPC 안정화",
    outcome: "stalled",
    tools: { Edit: 4, Read: 14, Bash: 22 },
    files: ["crates/ipc/lib.rs", "crates/ipc/src/pipe.rs"],
    events: 116, active_seconds: 4_080, total_seconds: 9_720, errors: 7,
    commit_shas: [],
    tickets: [{ ticket: "namedpipe_ipc", project: "wmux", confidence: 0.88 }],
  },
  // vault (no git)
  {
    uid: "mac_studio:claude_code:e3a8f11d",
    branch: "(no-branch)@vault@mac_studio",
    harness: "claude_code", native_id: "e3a8f11d-71b2-4e02-bcf9-5a4",
    started_at: "2026-04-25 09:14", last_active: "2026-04-25 11:30", ended_at: "2026-04-25 11:42",
    status: "archived",
    summary: "Daily note 정리 + ADR-012 발행. vault 편집만 — git commit 없음, 명시 capture로 수집.",
    goal:    "노트 publishing",
    outcome: "completed",
    tools: { Edit: 11, Write: 2 },
    files: ["2026-04-25.md", "ADR-012 rule-tuning.md", "Retriever.md"],
    events: 48, active_seconds: 1_920, total_seconds: 8_280, errors: 0,
    commit_shas: [],
    tickets: [],
  },
  // mac_laptop
  {
    uid: "mac_laptop:claude_code:b9e0d234",
    branch: "main@retriever@mac_laptop",
    harness: "claude_code", native_id: "b9e0d234-3a8c-4f1e-b220-71f",
    started_at: "2026-04-26 13:00", last_active: "2026-04-26 14:22", ended_at: "2026-04-26 14:25",
    status: "cleared",
    summary: "/clear 후 재시작 — 이전 본문은 hub에 보존됨.",
    goal:    "맥북에서 README 다듬기",
    outcome: "abandoned",
    tools: { Edit: 3, Read: 6 },
    files: ["README.md"],
    events: 22, active_seconds: 800, total_seconds: 4_920, errors: 0,
    commit_shas: [],
    tickets: [],
  },
  {
    uid: "mac_laptop:codex:s_2026_04_26_c",
    branch: "main@mbo_tally@mac_laptop",
    harness: "codex", native_id: "s_2026_04_26_c",
    started_at: "2026-04-26 18:10", last_active: "2026-04-26 19:38", ended_at: "2026-04-26 19:40",
    status: "archived",
    summary: "MBO 점수 집계 SQL 보정 — 분기 경계 처리.",
    goal:    "주간 산출 정합성",
    outcome: "completed",
    tools: { Edit: 5, Read: 8, Bash: 3 },
    files: ["src/agg/quarterly.ts", "tests/quarterly.spec.ts"],
    events: 64, active_seconds: 1_980, total_seconds: 5_400, errors: 1,
    commit_shas: ["a09c3e5"],
    tickets: [{ ticket: "mbo_quarterly_fix", project: "mbo_tally", confidence: 1.0 }],
  },
  // linux_dev
  {
    uid: "linux_dev:claude_code:8c1e7790",
    branch: "feat/rule-tuning@icube-quality@linux_dev",
    harness: "claude_code", native_id: "8c1e7790-2b4f-49aa-bd10-e3c",
    started_at: "2026-04-27 03:08", last_active: "2026-04-27 03:58", ended_at: null,
    status: "idle",
    summary: "야간 룰 튜닝 — 원격 서버에서 데이터 양 큰 회귀 테스트.",
    goal:    "prod 배포 전 검증",
    outcome: "in_progress",
    tools: { Edit: 7, Read: 24, Bash: 19 },
    files: ["rules/R-D20.sql", "rules/R-D31.sql", "tests/regression.csv"],
    events: 158, active_seconds: 2_640, total_seconds: 3_000, errors: 4,
    commit_shas: ["d11ac08"],
    tickets: [{ ticket: "auditor_false_positives", project: "icube_quality", confidence: 0.74 }],
  },
];

const HARNESS_STYLE = {
  claude_code: { color: "#C26F4A", bg: "#FBEFE8", label: "claude" },
  codex:       { color: "#8F4E2C", bg: "#F6E6DC", label: "codex"  },
  gemini:      { color: "#4A6B8A", bg: "#EAF0F6", label: "gemini" },
  qwen:        { color: "#5A8C6F", bg: "#E8F1EC", label: "qwen"   },
};

const STATUS_STYLE = {
  active:   { color: "#5A8C6F", bg: "#E8F1EC", dot: "#5A8C6F" },
  idle:     { color: "#B89028", bg: "#F7EED6", dot: "#B89028" },
  archived: { color: "#5C5A55", bg: "#F0EEE6", dot: "#8A8680" },
  cleared:  { color: "#A83E3E", bg: "#F6E4E4", dot: "#A83E3E" },
};

function fmtDur(sec) {
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h}h${mm}m` : `${h}h`;
}
function fmtBytes(b) {
  const mb = b / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function buildResumeCommands(s) {
  // Harness-specific resume hints. The point: tell the user *exactly* how to continue this
  // session on a different machine — Retriever doesn't move files, it tells you the IDs.
  const out = [];
  if (s.harness === "claude_code") {
    out.push({ label: "claude code · same machine",      cmd: `claude --resume ${s.native_id}` });
    out.push({ label: "claude code · other machine",     cmd: `rtv session pull ${s.uid} && claude --resume ${s.native_id}` });
    out.push({ label: "claude code · read-only replay",  cmd: `rtv session show ${s.uid} | less` });
  } else if (s.harness === "codex") {
    out.push({ label: "codex · same machine",            cmd: `codex --session ${s.native_id}` });
    out.push({ label: "codex · pull then continue",      cmd: `rtv session pull ${s.uid} && codex --session ${s.native_id}` });
  }
  out.push({ label: "open in vault (export .md)",        cmd: `rtv session export ${s.uid} --format md > vault/Sessions/${s.native_id}.md` });
  out.push({ label: "search transcript",                 cmd: `rtv session search ${s.uid} --query "<phrase>"` });
  return out;
}

function SessionBrowser({ openAgent }) {
  const [machine, setMachine] = React.useState(null);   // null = all
  const [repo,    setRepo]    = React.useState(null);
  const [branch,  setBranch]  = React.useState(null);
  const [session, setSession] = React.useState(null);
  const [focused, setFocused] = React.useState(false);
  const [filter,  setFilter]  = React.useState({ harness: "all", status: "all", q: "" });
  const [copied,  setCopied]  = React.useState(null);

  // Live data — fetched from /api/sessions on mount. Falls back to mock SB_SESSIONS.
  const [liveSessions, setLiveSessions] = React.useState(null);
  const [liveStatus,   setLiveStatus]   = React.useState("loading");
  const [timeWin,      setTimeWin]      = React.useState("today"); // today | yesterday | 7d | 30d | all
  const [searchHits,   setSearchHits]   = React.useState(null); // null = no FTS in effect; otherwise Set<session_uid>
  const [dailyDigest,  setDailyDigest]  = React.useState(null); // [{ ...session, summary }]

  // Refetch when time window changes
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.RTV_LIVE) { setLiveStatus("mock"); setLiveSessions([]); return; }
      setLiveStatus("loading");
      try {
        const since = window.RTV_LIVE.sinceFromWindow(timeWin);
        const until = window.RTV_LIVE.untilFromWindow(timeWin);
        const rows = await window.RTV_LIVE.fetchSessions({
          limit: 300,
          since: since || undefined,
          until: until || undefined,
        });
        if (cancelled) return;
        setLiveSessions(rows);
        setLiveStatus(rows.length ? "live" : "empty");
      } catch (e) {
        if (cancelled) return;
        setLiveStatus("error");
        setLiveSessions([]);
        console.warn("[retriever] live sessions fetch failed:", e.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [timeWin]);

  // Daily digest fetch — only when timeWin is today/yesterday
  React.useEffect(() => {
    if (!window.RTV_LIVE) { setDailyDigest(null); return; }
    if (timeWin !== "today" && timeWin !== "yesterday") { setDailyDigest(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const since = window.RTV_LIVE.sinceFromWindow(timeWin);
        const until = timeWin === "yesterday"
          ? window.RTV_LIVE.untilFromWindow("yesterday")
          : new Date().toISOString();
        if (!since || !until) return;
        const r = await window.RTV_LIVE.fetchDaily({ since, until, limit: 50 });
        if (cancelled) return;
        setDailyDigest(r.sessions || []);
      } catch (e) {
        if (!cancelled) {
          setDailyDigest(null);
          console.warn("[retriever] daily digest fetch failed:", e.message || e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [timeWin]);

  // Debounced FTS5 search — when filter.q changes, hit /api/sessions/search and intersect with current liveSessions.
  React.useEffect(() => {
    if (!window.RTV_LIVE) return;
    const q = (filter.q || "").trim();
    if (q.length < 2) { setSearchHits(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const hits = await window.RTV_LIVE.searchSessions(q, { limit: 200 });
        if (cancelled) return;
        setSearchHits(new Set(hits.map(h => h.session_uid)));
      } catch {
        if (!cancelled) setSearchHits(null);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [filter.q]);

  // Codex iter5 #3 fix — distinguish:
  //   "live" (API ok, ≥1 row) | "empty" (API ok, 0 rows in this window)
  //   "loading" (still fetching) | "error"/"mock" (API unreachable → demo)
  // useLive: render live data path even when 0 rows. Mock fallback ONLY when API unreachable.
  const apiReachable = liveStatus === "live" || liveStatus === "empty";
  const useLive = apiReachable;
  const ALL_SESSIONS = useLive ? (liveSessions || []) : SB_SESSIONS;
  const showMockBanner = !useLive && liveStatus !== "loading";

  // When the user selects a session in live mode, fetch detail and merge events.
  React.useEffect(() => {
    if (!session || !session.live || session._detailLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await window.RTV_LIVE.fetchDetail(session.uid, { transcript: false });
        if (cancelled) return;
        const evs = detail.events || [];
        const turns = window.RTV_LIVE.eventsToTurns(evs);
        const files = window.RTV_LIVE.filesFromEvents(evs);
        const summary = window.RTV_LIVE.summaryFromEvents(evs);
        setSession((cur) => cur && cur.uid === session.uid ? {
          ...cur,
          summary: cur.summary || summary,
          files: cur.files && cur.files.length ? cur.files : files,
          live_events: evs,
          live_turns: turns,
          _detailLoaded: true,
        } : cur);
      } catch (e) {
        console.warn("[retriever] session detail fetch failed:", e.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.uid]);

  // Auto-narrow children when parent changes
  React.useEffect(() => { if (repo && repo.split("@")[1] !== machine) setRepo(null); }, [machine]);
  React.useEffect(() => { if (branch && !branch.endsWith(repo || "")) setBranch(null); }, [repo]);

  // Esc exits focused mode
  React.useEffect(() => {
    if (!focused) return;
    const onKey = (e) => { if (e.key === "Escape") setFocused(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  // Build hierarchy filter sources from the active dataset (live in live mode, else fixtures)
  const machineList = useLive
    ? Array.from(new Map(ALL_SESSIONS.map(s => [s.machine || s.uid.split(":")[0], { id: s.machine || s.uid.split(":")[0], label: s.machine || s.uid.split(":")[0] }])).values())
    : SB_MACHINES;

  const visibleRepos    = useLive ? [] : SB_REPOS.filter(r => !machine || r.machine === machine);
  const visibleBranches = useLive ? [] : SB_BRANCHES.filter(b => !repo || b.repo === repo);
  let visibleSessions   = ALL_SESSIONS.filter(s => {
    if (branch  && s.branch !== branch) return false;
    if (repo    && !s.branch.endsWith(repo)) return false;
    if (machine && !s.uid.startsWith(machine + ":") && s.machine !== machine) return false;
    if (filter.harness !== "all" && s.harness !== filter.harness) return false;
    if (filter.status  !== "all" && s.status  !== filter.status)  return false;
    if (filter.q) {
      // Live mode: prefer FTS5 server-side hits when available; fall back to substring match
      if (useLive && searchHits) {
        if (!searchHits.has(s.uid)) return false;
      } else {
        const q = filter.q.toLowerCase();
        if (!(
          (s.summary || "").toLowerCase().includes(q) ||
          (s.uid || "").includes(q) ||
          (s.cwd || "").toLowerCase().includes(q) ||
          (s.native_id || "").toLowerCase().includes(q) ||
          (s.files || []).some(f => f.toLowerCase().includes(q))
        )) return false;
      }
    }
    return true;
  });
  visibleSessions = visibleSessions.sort((a, b) => b.last_active.localeCompare(a.last_active));

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  // Focused (single-session) mode — hides browser chrome
  if (focused && session) {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2 text-[12px]">
          <button onClick={() => setFocused(false)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono"
                  style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: "#5C5A55" }}>
            <span>‹</span><span>back to browser</span>
          </button>
          <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>
            / sessions / <span className="text-[#1A1A1A]">{session.uid}</span>
          </div>
          <span className="ml-auto text-[10px] font-mono" style={{ color: "#8A8680" }}>focused view · esc to exit</span>
        </div>
        <SessionDetail s={session} onCopy={copy} copied={copied} openAgent={openAgent}/>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>/ sessions</div>
          <h1 className="text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-1">Session browser</h1>
          <p className="text-[13px] text-[#5C5A55] mt-1">데몬이 수집한 세션을 좌측에서 선택, 우측에서 본문·resume 명령을 봅니다.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono" style={{ color: "#8A8680" }}>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
            title={liveStatus === "live" ? "라이브 데이터 (hub /api/sessions)" : liveStatus === "loading" ? "loading…" : liveStatus === "error" ? "API 도달 불가 — mock fallback" : "mock fixtures"}
            style={{
              background: liveStatus === "live" ? "#E8F0EA" : liveStatus === "error" ? "#FBEAE6" : "#F3F1EC",
              color: liveStatus === "live" ? "#5A8C6F" : liveStatus === "error" ? "#A83E3E" : "#8A8680",
            }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{
              background: liveStatus === "live" ? "#5A8C6F" : liveStatus === "loading" ? "#A88467" : liveStatus === "error" ? "#A83E3E" : "#C7C3B8",
              animation: liveStatus === "loading" ? "rtvPulse 1.6s ease-in-out infinite" : "none",
            }}/>
            {liveStatus}
          </span>
          <span>{visibleSessions.length} session{visibleSessions.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* Demo-mode banner — only when API is unreachable, never confuse user with mock data on a live deployment */}
      {showMockBanner && (
        <div className="mb-3 rounded-md border px-3 py-2 text-[12px] flex items-center gap-2"
             style={{ borderColor: "#F0C9C0", background: "#FBEAE6", color: "#A83E3E" }}>
          <span>●</span>
          <span><strong>데모 모드</strong> — hub /api/sessions에 접근할 수 없어 mock 데이터를 보여줍니다.</span>
          <span className="ml-auto text-[11px] font-mono" style={{ color: "#8A8680" }}>retriever client capture-sessions 후 hub start --http</span>
        </div>
      )}

      {/* Time window chips — primary affordance: "오늘 한 일" 한 번에 보기 */}
      {useLive && (
        <div className="mb-3 flex items-center gap-1.5 flex-wrap">
          {[
            { id: "today",     label: "오늘",     en: "today" },
            { id: "yesterday", label: "어제",     en: "yesterday" },
            { id: "7d",        label: "7일",      en: "7d" },
            { id: "30d",       label: "30일",     en: "30d" },
            { id: "all",       label: "전체",     en: "all" },
          ].map(w => {
            const active = timeWin === w.id;
            return (
              <button key={w.id} onClick={() => setTimeWin(w.id)}
                className="text-[12px] font-mono px-3 py-1.5 rounded-full border transition"
                style={{
                  borderColor: active ? "#C26F4A" : "#E8E6DE",
                  background:  active ? "#FBEFE8" : "#FFFFFF",
                  color:       active ? "#8F4E2C" : "#5C5A55",
                }}>
                {w.label}<span className="ml-1.5 opacity-60">{w.en}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Daily digest — only when timeWin is today/yesterday and live mode */}
      {useLive && dailyDigest && dailyDigest.length > 0 && (timeWin === "today" || timeWin === "yesterday") && (
        <DailyDigestPanel
          digest={dailyDigest}
          label={timeWin === "today" ? "오늘 한 일" : "어제 한 일"}
          onPick={(uid) => {
            const s = ALL_SESSIONS.find(x => x.uid === uid);
            if (s) setSession(s);
          }}
        />
      )}

      {/* Filter bar — machine / repo / branch as compact dropdowns + search + harness + status */}
      <div className="mb-3 p-2.5 rounded-md border flex items-center gap-2 flex-wrap"
           style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
        <FilterSelect label="machine" value={machine || ""} onChange={(v) => { setMachine(v || null); setRepo(null); setBranch(null); }}>
          <option value="">all machines · {ALL_SESSIONS.length}</option>
          {machineList.map(m => {
            const cnt = ALL_SESSIONS.filter(s => s.uid.startsWith(m.id + ":") || s.machine === m.id).length;
            return <option key={m.id} value={m.id}>▣ {m.label} · {cnt}</option>;
          })}
        </FilterSelect>
        {!useLive && <FilterSelect label="repo" value={repo || ""} onChange={(v) => { setRepo(v || null); setBranch(null); if (v) { const r = SB_REPOS.find(x => x.id === v); if (r) setMachine(r.machine); } }}>
          <option value="">all repos · {visibleRepos.length}</option>
          {visibleRepos.map(r => {
            const cnt = SB_SESSIONS.filter(s => s.branch.endsWith(r.id)).length;
            return <option key={r.id} value={r.id}>◆ {r.name} · {cnt}</option>;
          })}
        </FilterSelect>}
        {!useLive && <FilterSelect label="branch" value={branch || ""} onChange={(v) => { setBranch(v || null); if (v) { const b = SB_BRANCHES.find(x => x.id === v); if (b) { const r = SB_REPOS.find(x => x.id === b.repo); if (r) { setRepo(r.id); setMachine(r.machine); } } } }}>
          <option value="">all branches · {visibleBranches.length}</option>
          {visibleBranches.map(b => {
            const cnt = SB_SESSIONS.filter(s => s.branch === b.id).length;
            return <option key={b.id} value={b.id}>⎇ {b.name} · {cnt}</option>;
          })}
        </FilterSelect>}
        <span className="w-px h-5" style={{ background: "#E8E6DE" }}></span>
        <FilterSelect label="harness" value={filter.harness} onChange={(v) => setFilter({ ...filter, harness: v })}>
          <option value="all">all harnesses</option>
          <option value="claude_code">claude_code</option>
          <option value="codex">codex</option>
        </FilterSelect>
        <FilterSelect label="status" value={filter.status} onChange={(v) => setFilter({ ...filter, status: v })}>
          <option value="all">all statuses</option>
          <option value="active">active</option>
          <option value="idle">idle</option>
          <option value="archived">archived</option>
          <option value="cleared">cleared</option>
        </FilterSelect>
        <input
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          placeholder={useLive ? "🔍 본문 검색 (FTS5)" : "🔍 summary · file · uid"}
          className="text-[12px] font-mono px-2.5 py-1.5 rounded border ml-auto flex-1 min-w-[160px] sm:flex-initial sm:w-[260px]"
          style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: "#1A1A1A" }}/>
        {useLive && filter.q.trim().length >= 2 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ color: searchHits ? "#5A8C6F" : "#A88467", background: "#F3F1EC" }}>
            {searchHits ? `FTS5 · ${searchHits.size} match` : "검색 중…"}
          </span>
        )}
        {(machine || repo || branch || filter.harness !== "all" || filter.status !== "all" || filter.q) && (
          <button onClick={() => { setMachine(null); setRepo(null); setBranch(null); setFilter({ harness: "all", status: "all", q: "" }); }}
                  className="text-[11px] font-mono px-2 py-1.5 rounded"
                  style={{ color: "#8F4E2C", background: "#FBEFE8" }}>clear</button>
        )}
      </div>

      {/* Body: sessions list (left) + detail (right). Mobile = stacked, list↔detail toggle. */}
      <div className="rtv-sessions-body grid gap-3" style={{ minHeight: 600 }}>
        <Card className={`p-0 overflow-hidden ${session ? "rtv-sessions-list-when-detail" : ""}`}>
          <ColHeader>sessions · {visibleSessions.length}</ColHeader>
          <div className="p-1.5 max-h-[760px] overflow-auto">
            {visibleSessions.length === 0 && (
              <div className="px-3 py-8 text-center text-[11px] font-mono" style={{ color: "#8A8680" }}>
                {useLive && ALL_SESSIONS.length === 0
                  ? `이 시간 윈도(${timeWin})에 ${searchHits ? "매치되는 " : ""}세션 없음`
                  : "no sessions match"}
              </div>
            )}
            {visibleSessions.map(s => {
              const h = HARNESS_STYLE[s.harness];
              const st = STATUS_STYLE[s.status];
              const active = session?.uid === s.uid;
              return (
                <button key={s.uid} onClick={() => setSession(s)}
                  className="w-full text-left p-2.5 rounded-md mb-1 border transition block"
                  style={{
                    borderColor: active ? "#EDD4C2" : "transparent",
                    background: active ? "#FBEFE8" : "transparent",
                  }}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: h.color, background: h.bg }}>
                      {h.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: st.color, background: st.bg }}>
                      <span className="w-1 h-1 rounded-full" style={{ background: st.dot, animation: s.status === "active" ? "rtvPulse 1.6s ease-in-out infinite" : "none" }}></span>
                      {s.status}
                    </span>
                    <span className="ml-auto text-[10px] font-mono" style={{ color: "#8A8680" }}>{s.last_active.slice(5)}</span>
                  </div>
                  <div className="mt-1.5 text-[10px] font-mono flex items-center gap-1 flex-wrap" style={{ color: "#5C5A55" }}>
                    {(() => {
                      const parts = s.branch.split("@");
                      const br = parts[0], rp = parts[1] || "", mc = parts[2] || s.uid.split(":")[0];
                      return (
                        <>
                          <span style={{ color: "#A88467" }}>▣</span>
                          <span className="text-[#1A1A1A]">{mc}</span>
                          <span style={{ color: "#C7C3B8" }}>›</span>
                          <span style={{ color: "#4A6B8A" }}>◆</span>
                          <span className="text-[#1A1A1A]">{rp}</span>
                          <span style={{ color: "#C7C3B8" }}>›</span>
                          <span style={{ color: "#5A8C6F" }}>⎇</span>
                          <span className="text-[#1A1A1A] truncate">{br}</span>
                        </>
                      );
                    })()}
                  </div>
                  <div className="mt-1 text-[12px] text-[#1A1A1A] line-clamp-2 leading-snug">{s.summary}</div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] font-mono flex-wrap" style={{ color: "#8A8680" }}>
                    <span>{s.events} events</span>
                    <span>· active {fmtDur(s.active_seconds)}</span>
                    {(s.commit_shas || []).length > 0 && <span>· commits {(s.commit_shas || []).length}</span>}
                    {s.errors > 0 && <span style={{ color: "#A83E3E" }}>· {s.errors} err</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <div className={`rtv-sessions-detail ${!session ? "rtv-sessions-detail-empty" : ""}`}>
          {session ? (
            <div>
              {/* Mobile-only back button */}
              <button onClick={() => setSession(null)}
                className="rtv-sessions-back inline-flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-md border text-[12px] font-mono"
                style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: "#5C5A55", display: "none" }}>
                <span>‹</span><span>list</span>
              </button>
              <SessionDetail s={session} onCopy={copy} copied={copied} openAgent={openAgent}/>
            </div>
          ) : (
            <Card className="p-12 text-center text-[12px] font-mono h-full flex items-center justify-center" style={{ color: "#8A8680" }}>
              <div>
                <div className="text-[36px] mb-2" style={{ color: "#D8D4C7" }}>✦</div>
                <div>좌측에서 세션을 선택하면 본문 · resume 명령이 여기에 표시됩니다.</div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DailyDigestPanel({ digest, label, onPick }) {
  const totalEvents = digest.reduce((a, s) => a + (s.events_total || 0), 0);
  const totalErrors = digest.reduce((a, s) => a + (s.summary?.errors_count || 0), 0);
  const totalSeconds = digest.reduce((a, s) => a + (s.summary?.duration_seconds || 0), 0);
  return (
    <div className="mb-4 rounded-lg border overflow-hidden"
         style={{ borderColor: "#EDD4C2", background: "linear-gradient(180deg, #FBEFE8 0%, #FDFCF7 100%)" }}>
      <div className="px-4 py-2.5 border-b flex items-center gap-2 flex-wrap text-[12px] font-mono"
           style={{ borderColor: "#EDD4C2", color: "#8F4E2C" }}>
        <span className="font-semibold text-[14px] text-[#1A1A1A]">{label}</span>
        <span style={{ color: "#A88467" }}>·</span>
        <span>{digest.length} session{digest.length === 1 ? "" : "s"}</span>
        <span style={{ color: "#A88467" }}>·</span>
        <span>{totalEvents} events</span>
        {totalSeconds > 0 && (
          <>
            <span style={{ color: "#A88467" }}>·</span>
            <span>active ~{Math.round(totalSeconds / 60)}m</span>
          </>
        )}
        {totalErrors > 0 && (
          <span className="ml-auto inline-flex items-center gap-1" style={{ color: "#A83E3E" }}>● {totalErrors} errors</span>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        {digest.slice(0, 12).map((s) => {
          const cwdShort = (s.cwd_at_start || "").split("/").filter(Boolean).slice(-2).join("/") || "(no-cwd)";
          const tools = Object.entries(s.summary?.tool_counts || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
          const dur = s.summary?.duration_seconds || 0;
          const last = (s.last_active_at || "").slice(11, 16);
          const harnessStyle = s.harness === "claude_code"
            ? { color: "#8F4E2C", bg: "#FBEFE8" }
            : { color: "#5A8C6F", bg: "#E8F0EA" };
          return (
            <button key={s.session_uid} onClick={() => onPick(s.session_uid)}
              className="w-full text-left rounded-md p-2.5 border block transition hover:shadow-sm"
              style={{ borderColor: "#E8E6DE", background: "#FFFFFF" }}>
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
                <span className="px-1.5 py-0.5 rounded" style={{ color: harnessStyle.color, background: harnessStyle.bg }}>
                  {s.harness}
                </span>
                <span className="text-[#1A1A1A]">{cwdShort}</span>
                <span style={{ color: "#A88467" }}>·</span>
                <span style={{ color: "#5C5A55" }}>{Math.round(dur / 60)}m</span>
                <span style={{ color: "#A88467" }}>·</span>
                <span style={{ color: "#5C5A55" }}>{s.events_total || 0} events</span>
                {s.summary?.errors_count > 0 && (
                  <span className="px-1 py-0.5 rounded" style={{ color: "#A83E3E", background: "#FBEAE6" }}>● {s.summary.errors_count} err</span>
                )}
                <span className="ml-auto" style={{ color: "#8A8680" }}>{last}</span>
              </div>
              {s.summary?.first_user_msg && (
                <div className="mt-1.5 text-[12px] line-clamp-2" style={{ color: "#1A1A1A", overflowWrap: "anywhere" }}>
                  <span style={{ color: "#A88467" }}>›</span> {s.summary.first_user_msg}
                </div>
              )}
              {s.summary?.last_assistant_msg && (
                <div className="mt-1 text-[11px] line-clamp-2" style={{ color: "#5C5A55", overflowWrap: "anywhere" }}>
                  <span style={{ color: s.harness === "claude_code" ? "#8F4E2C" : "#5A8C6F" }}>↳</span> {s.summary.last_assistant_msg}
                </div>
              )}
              {tools.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[10px] font-mono" style={{ color: "#8A8680" }}>
                  {tools.map(([t, n]) => (
                    <span key={t} className="px-1.5 py-0.5 rounded"
                          style={{ background: "#F3F1EC", color: "#5C5A55" }}>{t} ×{n}</span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
        {digest.length > 12 && (
          <div className="text-center py-1.5 text-[10px] font-mono" style={{ color: "#A88467" }}>
            +{digest.length - 12} more — 아래 목록에서 전체 확인
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: "#8A8680" }}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
              className="text-[12px] font-mono px-2 py-1.5 rounded border"
              style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: "#3A3A36" }}>
        {children}
      </select>
    </label>
  );
}

function ColHeader({ children }) {
  return (
    <div className="px-3 py-2 border-b text-[10px] font-mono uppercase tracking-wider" style={{ borderColor: "#E8E6DE", color: "#8A8680", background: "#FAFAF7" }}>
      {children}
    </div>
  );
}

function ListBtn({ label, right, active, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-2 py-1.5 rounded-md mb-0.5 flex items-center gap-2 transition"
      style={{ background: active ? "#FBEFE8" : "transparent" }}>
      <div className="flex-1 min-w-0">{typeof label === "string" ? <span className="text-[12px] font-mono text-[#1A1A1A] truncate">{label}</span> : label}</div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </button>
  );
}

function Crumb({ children, active, onClick }) {
  return (
    <button onClick={onClick} className="px-1.5 py-0.5 rounded transition"
      style={{ background: active ? "#FBEFE8" : "transparent", color: active ? "#8F4E2C" : "#5C5A55" }}>
      {children}
    </button>
  );
}

function SessionDetail({ s, onCopy, copied, openAgent, onFocus }) {
  const h  = HARNESS_STYLE[s.harness];
  const st = STATUS_STYLE[s.status];
  const cmds = buildResumeCommands(s);
  const [tab, setTab] = React.useState("chat");

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b" style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: h.color, background: h.bg }}>{h.label}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: st.color, background: st.bg }}>
                <span className="w-1 h-1 rounded-full" style={{ background: st.dot }}></span>{s.status}
              </span>
              <span className="text-[11px] font-mono" style={{ color: "#8A8680" }}>{s.branch}</span>
            </div>
            <div className="mt-1.5 text-[14px] text-[#1A1A1A]">{s.summary}</div>
            <div className="mt-1 text-[11px] font-mono" style={{ color: "#8A8680" }}>goal · {s.goal}  outcome · <span style={{ color: s.outcome === "completed" ? "#5A8C6F" : s.outcome === "stalled" ? "#B89028" : s.outcome === "abandoned" ? "#A83E3E" : "#3A3A36" }}>{s.outcome}</span></div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            {onFocus && (
              <button onClick={onFocus}
                      title="Open in focused view"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] border font-mono"
                      style={{ background: "#FFFFFF", color: "#5C5A55", borderColor: "#E8E6DE" }}>
                <span>열기</span><span>⤢</span>
              </button>
            )}
            <button onClick={() => openAgent((s.tickets || [])[0]?.ticket || "gemma4_adapter", "ask", { session_uid: s.uid })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px]"
                    style={{ background: "#FBEFE8", color: "#8F4E2C", border: "1px solid #EDD4C2" }}>
              ✦ ask gemma4
            </button>
          </div>
        </div>

        {/* Meta strip */}
        <div className="mt-3 grid grid-cols-6 gap-3 text-[11px] font-mono">
          <Meta k="started"     v={s.started_at}/>
          <Meta k="last active" v={s.last_active}/>
          <Meta k="active time" v={fmtDur(s.active_seconds)}/>
          <Meta k="events"      v={s.events}/>
          <Meta k="commits"     v={(s.commit_shas || []).length === 0 ? "—" : (s.commit_shas || []).join(" · ")}/>
          <Meta k="errors"      v={s.errors === 0 ? "0" : <span style={{ color: "#A83E3E" }}>{s.errors}</span>}/>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-2 border-b" style={{ borderColor: "#E8E6DE" }}>
        {[["chat", "Chat"], ["resume", "Resume"], ["tools", "Tools & Files"], ["meta", "Identity"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className="px-3 py-2 text-[12px] mr-1"
            style={{
              color: tab === v ? "#8F4E2C" : "#5C5A55",
              borderBottom: tab === v ? "2px solid #C26F4A" : "2px solid transparent",
              fontWeight: tab === v ? 600 : 400,
            }}>{l}</button>
        ))}
      </div>

      <div className="p-5">
        {tab === "resume" && (
          <div>
            <div className="text-[12px] text-[#3A3A36] mb-3">
              이 세션을 다른 기기에서 이어가려면 아래 명령을 실행하세요. Retriever는 transcript를 hub에 보존하므로,
              <span className="font-mono"> rtv session pull</span>로 본문을 받은 뒤 하네스의 resume 기능으로 진입합니다.
            </div>
            <div className="space-y-2">
              {cmds.map((c, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-md border" style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
                  <div className="text-[10px] font-mono uppercase tracking-wider w-[180px] flex-shrink-0" style={{ color: "#8A8680" }}>{c.label}</div>
                  <div className="flex-1 min-w-0 font-mono text-[12px] text-[#1A1A1A] truncate">$ {c.cmd}</div>
                  <button onClick={() => onCopy(c.cmd, `${s.uid}:${i}`)}
                    className="flex-shrink-0 text-[10px] font-mono px-2 py-1 rounded border"
                    style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: copied === `${s.uid}:${i}` ? "#5A8C6F" : "#5C5A55" }}>
                    {copied === `${s.uid}:${i}` ? "copied" : "copy"}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 rounded-md" style={{ background: "#FAF5E7", border: "1px solid #ECE3C7" }}>
              <div className="text-[11px] font-mono mb-1" style={{ color: "#8C6D1E" }}>resume id</div>
              <div className="font-mono text-[12px] text-[#1A1A1A] flex items-center gap-2">
                <span>{s.native_id}</span>
                <span style={{ color: "#8A8680" }}>·</span>
                <span style={{ color: "#5C5A55" }}>uid {s.uid}</span>
                <button onClick={() => onCopy(s.uid, `${s.uid}:uid`)} className="ml-auto text-[10px] px-2 py-0.5 rounded border" style={{ borderColor: "#E5D5A5", color: copied === `${s.uid}:uid` ? "#5A8C6F" : "#8C6D1E" }}>
                  {copied === `${s.uid}:uid` ? "copied" : "copy uid"}
                </button>
              </div>
              <div className="mt-1.5 text-[10px] font-mono" style={{ color: "#8A8680" }}>
                {s.harness === "claude_code"
                  ? "claude code는 native_id로 resume합니다 — 단, 동일 jsonl 경로가 필요하므로 hub에서 pull 후 진입하세요."
                  : "codex는 session id로 resume — pull 후 동일 명령으로 본문 동기화."}
              </div>
            </div>
          </div>
        )}

        {tab === "chat" && (
          <SessionChat s={s} onCopy={onCopy} copied={copied}/>
        )}

        {tab === "tools" && (() => {
          const tools = s.tools || {};
          const files = s.files || [];
          const tickets = s.tickets || [];
          const toolEntries = Object.entries(tools);
          const max = toolEntries.length ? Math.max(...Object.values(tools)) : 1;
          return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "#8A8680" }}>tool_call_counts</div>
              <div className="space-y-1.5">
                {toolEntries.length === 0 && (
                  <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>(no tool calls)</div>
                )}
                {toolEntries.map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3">
                      <span className="text-[12px] font-mono text-[#1A1A1A] w-24 flex-shrink-0">{k}</span>
                      <div className="flex-1 h-3 rounded" style={{ background: "#F3F1EC" }}>
                        <div className="h-3 rounded" style={{ width: `${(v / max) * 100}%`, background: "#C26F4A" }}></div>
                      </div>
                      <span className="text-[11px] font-mono w-8 text-right" style={{ color: "#5C5A55" }}>{v}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "#8A8680" }}>files_touched · {files.length}</div>
              <div className="space-y-1">
                {files.length === 0 && (
                  <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>(no file edits captured)</div>
                )}
                {files.map(f => (
                  <div key={f} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: "#FAFAF7" }}>
                    <span className="text-[10px] font-mono" style={{ color: "#A88467" }}>◇</span>
                    <span className="text-[12px] font-mono text-[#1A1A1A] truncate">{f}</span>
                  </div>
                ))}
              </div>
              {tickets.length > 0 && (
                <>
                  <div className="text-[11px] font-mono uppercase tracking-wider mt-4 mb-2" style={{ color: "#8A8680" }}>tickets_mentioned</div>
                  {tickets.map(t => (
                    <div key={t.ticket} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: "#FBEFE8" }}>
                      <span className="text-[12px] font-mono" style={{ color: "#8F4E2C" }}>#{t.ticket}</span>
                      <span className="text-[10px] font-mono ml-auto" style={{ color: "#8A8680" }}>{t.project} · conf {t.confidence.toFixed(2)} · {t.confidence >= 0.8 ? "auto" : "candidate"}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
          );
        })()}

        {tab === "meta" && (
          <div className="grid grid-cols-2 gap-4 text-[12px] font-mono">
            <Field k="session_uid"  v={s.uid}/>
            <Field k="machine_id"   v={s.uid.split(":")[0]}/>
            <Field k="harness"      v={s.harness}/>
            <Field k="native_id"    v={s.native_id}/>
            <Field k="branch"       v={s.branch}/>
            <Field k="cwd_at_start" v={`~/dev/.../`}/>
            <Field k="bytes_total"  v={`${(s.events * 1.4).toFixed(0)} KB approx`}/>
            <Field k="content_hash" v={`sha256:${s.uid.slice(-8)}…`}/>
          </div>
        )}
      </div>
    </Card>
  );
}

function Meta({ k, v }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "#8A8680" }}>{k}</div>
      <div className="text-[12px] mt-0.5" style={{ color: "#1A1A1A" }}>{v}</div>
    </div>
  );
}
function Field({ k, v }) {
  return (
    <div className="flex items-start gap-2 py-1 border-b" style={{ borderColor: "#F0EEE6" }}>
      <span style={{ color: "#8A8680" }} className="w-32 flex-shrink-0">{k}</span>
      <span className="text-[#1A1A1A] flex-1 min-w-0 break-all">{v}</span>
    </div>
  );
}

Object.assign(window, { SessionBrowser });
