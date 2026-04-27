// Retriever — Schema Map (ER) with detail drawer

const SCHEMA_ENTITIES = [
  {
    id: "session_claude", x: 20, y: 40, w: 220, h: 170, group: "source",
    title: "claude_session", sub: "Claude Code transcript",
    description: "Claude Code 세션이 끝날 때 SessionEnd hook이 transcript를 캡처하고 인덱싱합니다. tool_calls는 MCP 호출 흐름을 추적해 추후 reproducibility 검증에 사용됩니다.",
    fields: [
      { k: "session_id", t: "TEXT PK", desc: "ULID 형식. 세션 시작 시각 + 디바이스 호스트로 생성." },
      { k: "project",    t: "TEXT FK", desc: "→ project.id. CLAUDE.md가 있는 디렉토리 기반으로 자동 탐지." },
      { k: "started_at", t: "TS",      desc: "ISO 8601 (KST). hook이 SessionStart에서 기록." },
      { k: "ended_at",   t: "TS",      desc: "SessionEnd 시각. NULL이면 비정상 종료(crash)." },
      { k: "transcript", t: "MD",      desc: "마크다운 형식. user/assistant 턴이 H2 헤더로 구분." },
      { k: "tool_calls", t: "JSON[]",  desc: "각 entry: {name, args, result, ms}. MCP 호출 trace." },
    ],
    sample: {
      session_id: "01HVZ8E7K3XAB-asus-win01",
      project:    "retriever",
      started_at: "2026-04-22T15:02:14+09:00",
      ended_at:   "2026-04-22T16:48:33+09:00",
      transcript: "## user\nGemma4 어댑터 마무리하자\n\n## assistant\n좋아요. base.ts의 시그니처를 먼저…",
      tool_calls: '[{"name":"rtv_collect","args":{"project":"retriever"},"ms":342}, …]',
    },
    examples: [
      { name: "session-2026-04-22-adapter.md", attached_to: "gemma4_adapter", added: "2026-04-22 16:04" },
      { name: "session-2026-04-23-hash.md",    attached_to: "summary_cache",  added: "2026-04-23 15:10" },
      { name: "session-2026-04-24-watchdog.md",attached_to: "watchdog_tune",  added: "2026-04-24 14:40" },
    ],
    write_path: "vault://devices/{device}/{project}/sessions/{session_id}.md",
    cardinality_in:  "1 project — N sessions",
    cardinality_out: "1 session — 1 attachment(kind=session)",
  },
  {
    id: "session_codex", x: 20, y: 232, w: 220, h: 150, group: "source",
    title: "codex_session", sub: ".codex/ directory",
    description: "Codex 어댑터가 .codex/ 디렉토리를 mtime+해시 증분 스캔으로 수집. 패치(diff) 단위로 첨부됩니다.",
    fields: [
      { k: "session_id",  t: "TEXT PK", desc: ".codex/sessions/{ts}.json 파일명 기반." },
      { k: "instruction", t: "MD",      desc: "유저 instruction 원문." },
      { k: "diff",        t: "PATCH",   desc: "유니파이드 diff. files[]는 derived field로 추출." },
      { k: "exit_status", t: "INT",     desc: "0=success, !0=abort. blocked tickets는 보통 1." },
    ],
    sample: {
      session_id:  "20260423-150045-codex",
      instruction: "watchdog polling 주기를 adaptive로 바꿔줘",
      diff:        "--- a/src/core/watchdog.ts\n+++ b/src/core/watchdog.ts\n@@ -12,7 +12,9 @@\n-const INTERVAL = 30_000;\n+const MIN = 10_000, MAX = 120_000;",
      exit_status: 0,
    },
    examples: [
      { name: "watchdog-adaptive.patch", attached_to: "watchdog_tune", added: "2026-04-24 14:40" },
    ],
    write_path: "{repo}/.codex/sessions/{session_id}.json",
    cardinality_in:  "1 repo — N codex sessions",
    cardinality_out: "1 codex_session — 1 attachment(kind=diff)",
  },
  {
    id: "vault_note", x: 20, y: 404, w: 220, h: 170, group: "source",
    title: "vault_note", sub: "Obsidian .md",
    description: "Obsidian 볼트의 일반 노트. backlinks를 따라 ticket과 자동 연결됩니다. frontmatter는 YAML이며 type 필드로 노트 종류를 구분.",
    fields: [
      { k: "path",        t: "TEXT PK", desc: "vault root 기준 상대경로." },
      { k: "frontmatter", t: "YAML",    desc: "type, tags, related, decided_at 등." },
      { k: "body",        t: "MD",      desc: "본문. [[wikilink]]는 backlinks로 인덱싱." },
      { k: "backlinks",   t: "TEXT[]",  desc: "이 노트를 가리키는 다른 노트의 path 목록." },
      { k: "updated_at",  t: "TS",      desc: "파일시스템 mtime. Obsidian Sync로 갱신됨." },
    ],
    sample: {
      path:        "30_research/namedpipe-vs-afunix.md",
      frontmatter: "type: research\ntags: [ipc, windows]\nrelated: [[wmux/namedpipe_ipc]]",
      body:        "Windows NamedPipe는 기본 1024 동시연결, AF_UNIX는 커널 소켓 수 제한…",
      backlinks:   '["50_tickets/wmux/namedpipe_ipc.md", "10_daily/2026-04-15.md"]',
      updated_at:  "2026-04-15T10:20:00+09:00",
    },
    examples: [
      { name: "namedpipe-vs-afunix.md",  attached_to: "namedpipe_ipc",         added: "2026-04-15 10:20" },
      { name: "invalidation-strategies.md", attached_to: "summary_cache",       added: "2026-04-24 11:00" },
      { name: "R-D20-false-positive-analysis.md", attached_to: "auditor_false_positives", added: "2026-04-15 14:00" },
    ],
    write_path: "vault://{path}",
    cardinality_in:  "유저가 직접 작성",
    cardinality_out: "1 note — N attachments (multi-ticket 가능)",
  },
  {
    id: "git_commit", x: 20, y: 596, w: 220, h: 150, group: "source",
    title: "git_commit", sub: "Repository",
    description: "프로젝트 리포지토리의 커밋. files 변경 경로가 Retriever의 collector와 일치하면 자동으로 attachment 후보가 됩니다.",
    fields: [
      { k: "sha",     t: "TEXT PK", desc: "커밋 SHA. 7-char short도 허용." },
      { k: "repo",    t: "TEXT FK", desc: "→ project.repo. 모노레포는 path prefix 사용." },
      { k: "files",   t: "TEXT[]",  desc: "변경된 파일 경로 목록." },
      { k: "message", t: "TEXT",    desc: "커밋 메시지 첫 줄. body는 별도 join으로." },
    ],
    sample: {
      sha:     "8f3a91c",
      repo:    "retriever",
      files:   '["src/adapters/gemma4.ts", "src/adapters/gemma4-prompts.ts"]',
      message: "feat(adapters): implement gemma4 with json mode",
    },
    examples: [
      { name: "8f3a91c", attached_to: "gemma4_adapter", added: "2026-04-23 14:48" },
    ],
    write_path: "git://{repo}@{sha}",
    cardinality_in:  "1 repo — N commits",
    cardinality_out: "1 commit — 1 attachment(kind=diff)",
  },
  {
    id: "attachment", x: 330, y: 200, w: 240, h: 200, group: "bundle",
    title: "attachment", sub: "unified reference",
    description: "attachment는 다양한 source(session/note/commit)를 한 ticket으로 묶는 조인 레코드입니다. source_ref URI로 원본을 참조하며 hash로 중복 제거합니다.",
    fields: [
      { k: "att_id",     t: "TEXT PK", desc: "ticket_id + 짧은 nanoid." },
      { k: "ticket_id",  t: "TEXT FK", desc: "→ ticket.task_id." },
      { k: "kind",       t: "ENUM",    desc: "session | diff | research | external | transcript." },
      { k: "source_ref", t: "URI",     desc: "vault://… , git://… , https://… 등." },
      { k: "added_at",   t: "TS",      desc: "첨부 시각 — summary stale 판정에 사용." },
      { k: "hash",       t: "SHA256",  desc: "원본 콘텐츠 해시. 중복 차단 + invalidation key." },
      { k: "preview",    t: "TEXT",    desc: "첫 200자 + 핵심 인용. UI 카드에 표시." },
    ],
    sample: {
      att_id:     "gemma4_adapter-x7q2",
      ticket_id:  "gemma4_adapter",
      kind:       "session",
      source_ref: "vault://devices/asus-win01/retriever/sessions/01HVZ8E7K3XAB.md",
      added_at:   "2026-04-22 16:04",
      hash:       "sha256:9e3f…",
      preview:    "rtv_collect 호출 후 Ollama가 JSON 파싱 실패 → format:'json' 강제로 해결…",
    },
    examples: [
      { name: "session-2026-04-22-adapter.md (kind=session)", attached_to: "gemma4_adapter" },
      { name: "src-adapters-gemma4.patch (kind=diff)",        attached_to: "gemma4_adapter" },
      { name: "namedpipe-vs-afunix.md (kind=research)",        attached_to: "namedpipe_ipc"  },
    ],
    write_path: "vault://_derived/attachments/{ticket_id}/{att_id}.yaml",
    cardinality_in:  "N sources — N attachments",
    cardinality_out: "N attachments — 1 ticket",
  },
  {
    id: "ticket", x: 640, y: 260, w: 260, h: 260, group: "bundle",
    title: "ticket", sub: "ticket.md bundle",
    description: "한 작업 단위 = 하나의 ticket.md 파일. frontmatter + body + criteria의 세 부분으로 구성됩니다. attachment와 derived 레코드의 허브.",
    fields: [
      { k: "task_id",    t: "TEXT PK", desc: "snake_case slug. 프로젝트 내 유일." },
      { k: "project",    t: "TEXT FK", desc: "→ project.id." },
      { k: "summary",    t: "TEXT",    desc: "한 줄 요약. 칸반 카드 제목." },
      { k: "status",     t: "ENUM",    desc: "todo | in_progress | review | done | blocked | stalled." },
      { k: "priority",   t: "ENUM",    desc: "high | med | low." },
      { k: "criteria",   t: "JSON[]",  desc: "{text, done, evidence?} — 완료 조건 배열." },
      { k: "body",       t: "MD",      desc: "ticket 본문. 결정·맥락·다음 단계 기록." },
      { k: "created_at", t: "TS",      desc: "최초 생성 시각." },
      { k: "updated_at", t: "TS",      desc: "마지막 frontmatter 또는 body 수정 시각." },
    ],
    sample: {
      task_id:    "gemma4_adapter",
      project:    "retriever",
      summary:    "Gemma4 런타임 MCP 어댑터 추가",
      status:     "done",
      priority:   "high",
      criteria:   '[{"text":"Ollama JSON 모드 호출 성공","done":true,"evidence":"session #7"}]',
      body:       "Ollama 로컬 런타임을 BaseAdapter 시그니처에 맞춰 얇게 래핑…",
      created_at: "2026-04-21 09:14",
      updated_at: "2026-04-23 16:02",
    },
    examples: [
      { name: "gemma4_adapter (status=done, 2 attachments)", attached_to: "retriever" },
      { name: "namedpipe_ipc  (status=blocked, 4 attachments)", attached_to: "wmux"     },
      { name: "summary_cache  (status=in_progress, 3 attachments)", attached_to: "retriever" },
    ],
    write_path: "vault://50_tickets/{project}/{task_id}.md",
    cardinality_in:  "1 ticket — N attachments",
    cardinality_out: "1 ticket — 1 summary, 1 ticket — N activity_events",
  },
  {
    id: "summary", x: 980, y: 220, w: 220, h: 170, group: "derived",
    title: "summary", sub: "_derived/ (Gemma4)",
    description: "Gemma4가 attachment 묶음을 입력으로 생성한 자연어 요약. 입력 해시가 바뀌면 stale로 표시되며, 자동 재생성하지 않습니다(LLM 비용 통제).",
    fields: [
      { k: "ticket_id",      t: "TEXT PK", desc: "→ ticket.task_id (1:1)." },
      { k: "body",           t: "MD",      desc: "5~7문장 요약." },
      { k: "attach_hash",    t: "SHA256",  desc: "attachment 묶음의 해시. ≠ 현재 묶음이면 stale." },
      { k: "regenerated_at", t: "TS",      desc: "마지막 생성 시각." },
      { k: "fresh",          t: "BOOL",    desc: "derived: hash == current_hash." },
    ],
    sample: {
      ticket_id:      "gemma4_adapter",
      body:           "Gemma4 어댑터가 완성되었습니다. JSON 출력 안정성을 위해 format:'json' 플래그를 강제하고…",
      attach_hash:    "sha256:bc41…",
      regenerated_at: "2026-04-23 16:04",
      fresh:          true,
    },
    examples: [
      { name: "summary/gemma4_adapter.md (fresh)", attached_to: "gemma4_adapter" },
      { name: "summary/summary_cache.md  (stale: +1 attachment)", attached_to: "summary_cache" },
    ],
    write_path: "vault://_derived/summary/{ticket_id}.md",
    cardinality_in:  "1 ticket — 1 summary",
    cardinality_out: "—",
  },
  {
    id: "activity", x: 980, y: 420, w: 220, h: 150, group: "derived",
    title: "activity_event", sub: "immutable log",
    description: "ticket에 발생한 모든 사건의 append-only 로그. 상태 전이, 첨부 추가, 에이전트 호출, criteria 변경을 모두 기록합니다.",
    fields: [
      { k: "event_id", t: "INT PK",  desc: "auto-increment." },
      { k: "ticket_id",t: "TEXT FK", desc: "→ ticket.task_id." },
      { k: "kind",     t: "ENUM",    desc: "create | status | attach | agent | criterion | update." },
      { k: "text",     t: "TEXT",    desc: "사람이 읽는 메시지." },
      { k: "at",       t: "TS",      desc: "이벤트 시각." },
    ],
    sample: {
      event_id:  4012,
      ticket_id: "gemma4_adapter",
      kind:      "agent",
      text:      "Gemma4 — Verify completion · ✓ 모든 3 criteria 충족",
      at:        "2026-04-23 15:48",
    },
    examples: [
      { name: "status → done",       attached_to: "gemma4_adapter" },
      { name: "Gemma4 — Verify",     attached_to: "gemma4_adapter" },
      { name: "첨부 추가 · session", attached_to: "summary_cache"   },
    ],
    write_path: "vault://_derived/activity/{ticket_id}.jsonl",
    cardinality_in:  "1 ticket — N events",
    cardinality_out: "—",
  },
];

const SCHEMA_EDGES = [
  { from: "session_claude", to: "attachment", label: "kind=session",   card: "N:1" },
  { from: "session_codex",  to: "attachment", label: "kind=diff",      card: "N:1" },
  { from: "vault_note",     to: "attachment", label: "kind=research",  card: "N:1" },
  { from: "git_commit",     to: "attachment", label: "kind=diff",      card: "N:1" },
  { from: "attachment",     to: "ticket",     label: "ticket_id",      card: "N:1" },
  { from: "ticket",         to: "summary",    label: "derive(gemma4)", card: "1:1" },
  { from: "ticket",         to: "activity",   label: "emits",          card: "1:N" },
];

function SchemaMap() {
  const [highlight, setHighlight] = React.useState(null);
  const [detail,    setDetail]    = React.useState(null); // entity object

  const byId = Object.fromEntries(SCHEMA_ENTITIES.map(e => [e.id, e]));
  const W = 1220, H = 780;

  const edgePath = (e) => {
    const a = byId[e.from], b = byId[e.to];
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const x2 = b.x,       y2 = b.y + b.h / 2;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };

  const isHot = (id) => highlight && (highlight === id || SCHEMA_EDGES.some(e => (e.from === highlight && e.to === id) || (e.to === highlight && e.from === id)));
  const edgeHot = (e) => highlight === e.from || highlight === e.to;

  const openDetail = (e) => { setDetail(e); setHighlight(e.id); };
  const closeDetail = () => { setDetail(null); setHighlight(null); };

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-mono" style={{ color: "#8A8680" }}>/ schema</div>
          <h1 className="text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-1">Session merge schema</h1>
          <p className="text-[13px] text-[#5C5A55] mt-1">엔티티를 클릭하면 우측에 필드 정의·샘플 레코드·예시가 펼쳐집니다.</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono" style={{ color: "#5C5A55" }}>
          <Legend color="#A88467" label="source"/>
          <Legend color="#C26F4A" label="bundle"/>
          <Legend color="#5A8C6F" label="derived"/>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block", background: "#FDFCF7" }}>
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#F0EEE6" strokeWidth="1"/>
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8A8680"/>
            </marker>
            <marker id="arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#C26F4A"/>
            </marker>
          </defs>
          <rect width={W} height={H} fill="url(#grid)"/>

          <text x={130}  y={22} fontSize="10" fontFamily="JetBrains Mono" fill="#A88467" textAnchor="middle">SOURCES</text>
          <text x={450}  y={22} fontSize="10" fontFamily="JetBrains Mono" fill="#C26F4A" textAnchor="middle">BUNDLE</text>
          <text x={1090} y={22} fontSize="10" fontFamily="JetBrains Mono" fill="#5A8C6F" textAnchor="middle">DERIVED</text>

          {SCHEMA_EDGES.map((e, i) => {
            const hot = edgeHot(e);
            const a = byId[e.from], b = byId[e.to];
            const mx = (a.x + a.w + b.x) / 2;
            const my = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
            return (
              <g key={i} style={{ opacity: highlight && !hot ? 0.18 : 1, transition: "opacity 150ms" }}>
                <path d={edgePath(e)} fill="none" stroke={hot ? "#C26F4A" : "#B5B1A8"} strokeWidth={hot ? 1.8 : 1.2}
                      markerEnd={hot ? "url(#arrow-hot)" : "url(#arrow)"} strokeDasharray={e.card === "1:1" ? "0" : "4 3"}/>
                <rect x={mx - 38} y={my - 16} width="76" height="28" rx="4"
                      fill="#FFFFFF" stroke={hot ? "#EDD4C2" : "#E8E6DE"}/>
                <text x={mx} y={my - 4} fontSize="9" fontFamily="JetBrains Mono" fill={hot ? "#8F4E2C" : "#5C5A55"} textAnchor="middle">{e.label}</text>
                <text x={mx} y={my + 7} fontSize="8" fontFamily="JetBrains Mono" fill="#8A8680" textAnchor="middle">{e.card}</text>
              </g>
            );
          })}

          {SCHEMA_ENTITIES.map(e => {
            const c = e.group === "source" ? "#A88467" : e.group === "bundle" ? "#C26F4A" : "#5A8C6F";
            const active = detail && detail.id === e.id;
            const dim = highlight && !isHot(e.id);
            return (
              <g key={e.id} onClick={() => openDetail(e)}
                 style={{ cursor: "pointer", opacity: dim ? 0.3 : 1, transition: "opacity 150ms" }}>
                <rect x={e.x} y={e.y} width={e.w} height={e.h} rx="8" fill="#FFFFFF"
                      stroke={active ? c : "#E8E6DE"} strokeWidth={active ? 2 : 1}/>
                <rect x={e.x} y={e.y} width={e.w} height="28" rx="8" fill={c} opacity="0.12"/>
                <rect x={e.x} y={e.y + 20} width={e.w} height="8" fill={c} opacity="0.12"/>
                <text x={e.x + 12} y={e.y + 18} fontSize="12" fontFamily="Inter" fontWeight="600" fill={c}>{e.title}</text>
                <text x={e.x + e.w - 12} y={e.y + 18} fontSize="9" fontFamily="JetBrains Mono" fill={c} textAnchor="end">{e.sub}</text>
                {e.fields.map((f, i) => {
                  const isKey = f.t.includes("PK") || f.t.includes("FK");
                  return (
                    <g key={f.k}>
                      <text x={e.x + 14} y={e.y + 48 + i * 19} fontSize="11" fontFamily="JetBrains Mono"
                            fill={isKey ? "#1A1A1A" : "#3A3A36"} fontWeight={isKey ? 600 : 400}>
                        {f.t.includes("PK") ? "◆ " : f.t.includes("FK") ? "◇ " : "  "}{f.k}
                      </text>
                      <text x={e.x + e.w - 14} y={e.y + 48 + i * 19} fontSize="10" fontFamily="JetBrains Mono"
                            fill="#8A8680" textAnchor="end">{f.t}</text>
                    </g>
                  );
                })}
                {/* hint chevron */}
                <text x={e.x + e.w - 10} y={e.y + e.h - 8} fontSize="11" fontFamily="JetBrains Mono"
                      fill="#B5B1A8" textAnchor="end">click for detail →</text>
              </g>
            );
          })}
        </svg>
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-4 text-[12px]">
        <Card className="p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "#A88467" }}>sources — 원자 단위</div>
          <div className="text-[12px] text-[#3A3A36]">각 세션·노트·커밋은 <span className="font-mono">source_ref</span> URI로 참조되며, 해시로 중복 제거됩니다. 원본은 이동·삭제하지 않습니다.</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "#C26F4A" }}>bundle — 티켓 단위</div>
          <div className="text-[12px] text-[#3A3A36]"><span className="font-mono">attachment</span>이 다수의 source를 한 티켓으로 묶는 조인 테이블. 티켓은 <span className="font-mono">frontmatter + body + criteria</span>를 담은 ticket.md 한 장입니다.</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "#5A8C6F" }}>derived — Gemma4 파생</div>
          <div className="text-[12px] text-[#3A3A36]"><span className="font-mono">summary</span>는 attachment의 해시에 바인딩 — 입력이 바뀌면 stale. <span className="font-mono">activity_event</span>는 immutable log.</div>
        </Card>
      </div>

      {detail && <SchemaDetail entity={detail} onClose={closeDetail}/>}
    </div>
  );
}

function SchemaDetail({ entity, onClose }) {
  const c = entity.group === "source" ? "#A88467" : entity.group === "bundle" ? "#C26F4A" : "#5A8C6F";
  const [tab, setTab] = React.useState("fields");

  React.useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-y-0 right-0 flex" style={{ zIndex: 50 }}>
      <div className="fixed inset-0" style={{ background: "rgba(26,26,26,0.25)" }} onClick={onClose}></div>
      <aside className="relative bg-white h-full flex flex-col shadow-2xl border-l overflow-hidden"
             style={{ width: 520, borderColor: "#E8E6DE" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c }}></span>
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: c }}>{entity.group}</span>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded hover:bg-[#F3F1EC] text-[#8A8680]">✕</button>
          </div>
          <h2 className="text-[20px] font-semibold text-[#1A1A1A] mt-2 font-mono">{entity.title}</h2>
          <div className="text-[11px] font-mono mt-0.5" style={{ color: "#8A8680" }}>{entity.sub}</div>
          <p className="text-[13px] text-[#3A3A36] mt-3 leading-relaxed">{entity.description}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] font-mono">
            <div>
              <div style={{ color: "#8A8680" }}>cardinality in</div>
              <div className="text-[#1A1A1A] mt-0.5">{entity.cardinality_in}</div>
            </div>
            <div>
              <div style={{ color: "#8A8680" }}>cardinality out</div>
              <div className="text-[#1A1A1A] mt-0.5">{entity.cardinality_out}</div>
            </div>
            <div className="col-span-2">
              <div style={{ color: "#8A8680" }}>write path</div>
              <div className="text-[#1A1A1A] mt-0.5 break-all">{entity.write_path}</div>
            </div>
          </div>
        </div>

        <div className="flex border-b" style={{ borderColor: "#E8E6DE" }}>
          {[
            { id: "fields",   label: `Fields (${entity.fields.length})` },
            { id: "sample",   label: "Sample row" },
            { id: "examples", label: `Examples (${entity.examples.length})` },
          ].map(x => (
            <button key={x.id} onClick={() => setTab(x.id)}
              className="px-4 py-2.5 text-[12px] -mb-px border-b-2"
              style={{
                borderColor: tab === x.id ? c : "transparent",
                color: tab === x.id ? "#1A1A1A" : "#5C5A55",
                fontWeight: tab === x.id ? 600 : 400,
              }}>{x.label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "fields" && (
            <div>
              {entity.fields.map((f, i) => {
                const isPK = f.t.includes("PK"), isFK = f.t.includes("FK");
                return (
                  <div key={f.k} className="px-5 py-3 border-b" style={{ borderColor: "#F0EEE6" }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span style={{ color: c }} className="font-mono text-[12px]">{isPK ? "◆" : isFK ? "◇" : "·"}</span>
                        <span className="font-mono text-[13px] font-semibold text-[#1A1A1A] truncate">{f.k}</span>
                      </div>
                      <span className="font-mono text-[10px] flex-shrink-0 px-1.5 py-0.5 rounded" style={{
                        background: isPK || isFK ? "#FBEFE8" : "#F3F1EC",
                        color: isPK || isFK ? "#8F4E2C" : "#5C5A55",
                      }}>{f.t}</span>
                    </div>
                    <div className="text-[12px] text-[#3A3A36] mt-1.5 leading-relaxed">{f.desc}</div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "sample" && (
            <div className="p-5">
              <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "#8A8680" }}>example record (yaml)</div>
              <pre className="rounded-md border p-3 text-[11px] font-mono overflow-x-auto leading-relaxed"
                   style={{ borderColor: "#E8E6DE", background: "#FDFCF7", color: "#1A1A1A" }}>
{Object.entries(entity.sample).map(([k, v]) =>
`${k.padEnd(15)}: ${typeof v === "string" && v.includes("\n") ? "|\n  " + v.split("\n").join("\n  ") : v}`
).join("\n")}
              </pre>
              <div className="mt-3 text-[11px] text-[#5C5A55]">이 형태로 디스크에 저장됩니다. 모든 source는 plain-text(YAML/MD)로만 보존되어 어떤 도구에서도 읽을 수 있습니다.</div>
            </div>
          )}

          {tab === "examples" && (
            <div className="p-5 space-y-2">
              <div className="text-[11px] text-[#5C5A55] mb-2">현재 볼트에서 이 엔티티에 해당하는 실제 레코드:</div>
              {entity.examples.map((ex, i) => (
                <div key={i} className="rounded-md border p-3"
                     style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
                  <div className="font-mono text-[12px] text-[#1A1A1A]">{ex.name}</div>
                  <div className="font-mono text-[10px] mt-1 flex items-center gap-2" style={{ color: "#8A8680" }}>
                    {ex.attached_to && <><span>→ {ex.attached_to}</span></>}
                    {ex.added && <><span>·</span><span>{ex.added}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t px-5 py-2.5 flex items-center justify-between text-[10px] font-mono"
             style={{ borderColor: "#E8E6DE", background: "#FDFCF7", color: "#8A8680" }}>
          <span>esc to close</span>
          <span>{entity.fields.length} fields · {entity.examples.length} examples</span>
        </div>
      </aside>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded" style={{ background: color, opacity: 0.25, border: `1px solid ${color}` }}></span>
      <span>{label}</span>
    </span>
  );
}

Object.assign(window, { SchemaMap });
