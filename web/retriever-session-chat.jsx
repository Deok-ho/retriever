// Retriever — Session chat transcript view
// Renders a captured LLM session as a real chat conversation.
// Per-uid scripted transcripts so each session feels distinct.

const CHAT_TRANSCRIPTS = {
  // --- retriever / session_mgr_3b (active claude_code) ---
  "mac_studio:claude_code:0a1f3c2e": [
    { kind: "user", text: "Phase 3B 시작하자. session manager 스키마 v2 — 어떤 테이블이 필요할 것 같아? 일단 설계만, 코드 X." },
    { kind: "thinking", text: "현재 스키마는 sessions 한 테이블 + JSON blob이라 분석 쿼리가 비효율. 정규화 필요. tools / files / messages를 별도 테이블로 분리하면 인덱싱·요약·증거 추적이 깔끔해짐. transcript 본문은 따로 두는 게 맞음(I/O 무거움)." },
    { kind: "assistant", text: "정규화 방향으로 7개 테이블 제안합니다. 본문은 분리하고, 분석 결과는 캐시 테이블로:" },
    { kind: "assistant_block", title: "schema-v2 (제안)", lines: [
      "sessions             ─ 1행 = 1 LLM 세션 (uid, harness, branch, …)",
      "session_transcripts  ─ jsonl-v1 본문 (sessions:1↔1, BLOB)",
      "session_events       ─ 메시지/툴콜/thinking 단위 행 (FTS5)",
      "session_files        ─ files_touched 정규화",
      "session_tools        ─ tool_call_counts 정규화",
      "session_analysis     ─ Gemma4 요약/분류 결과 캐시",
      "session_links        ─ tickets / commits / vault 링크",
    ]},
    { kind: "user", text: "왜 events를 분리해? sessions에 JSON으로 박아도 되지 않나." },
    { kind: "assistant", text: "FTS5 검색 + 부분 페치 때문에. 한 세션이 200 events 쯤 되는데, '내가 어제 R-D20 만진 세션 어디였지' 같은 질의는 events 행을 직접 검색해야 빠릅니다. JSON blob은 fts에 통째로 들어가서 fragment가 거대해짐." },
    { kind: "tool", tool: "Read", args: "docs/architecture.md", result_lines: 142, summary: "현행 구조 확인 — sessions 단일 테이블, transcripts는 디스크 jsonl 파일." },
    { kind: "tool", tool: "Read", args: "src/db/migrations/0001_init.sql", result_lines: 38 },
    { kind: "thinking", text: "한국어 토크나이저 어떻게 가지? FTS5 unicode61는 한글 분해 안 됨. icu_ko 외부 토크나이저를 쓰거나, trigram fallback. 일단 trigram으로 simple하게 가고 옵션으로 icu 노출." },
    { kind: "assistant", text: "한국어 검색은 FTS5 trigram으로 1차, icu_ko를 옵션으로 둡니다(설치된 환경에서만). 이건 ADR로 따로 빼겠습니다." },
    { kind: "user", text: "OK. 마이그레이션 SQL 초안 써줘. 0002_sessions.sql." },
    { kind: "tool", tool: "Edit", args: "src/db/migrations/0002_sessions.sql", diff: "+247 −0", summary: "7 tables + 4 indexes + FTS5 virtual table" },
    { kind: "assistant", text: "초안 반영. 핵심:\n• `session_events.ts` 인덱스로 시간 범위 조회 빠르게\n• `session_files (path, session_uid)` 복합 키 — '이 파일을 만진 세션들'\n• fts(content) 트리거로 events.text를 자동 인덱싱\n변경 요청 받습니다." },
    { kind: "user", text: "좋다. 다음 세션에서 적용하자." },
  ],

  // --- retriever / git hook spike (archived, codex-archived behavior, but claude_code here) ---
  "mac_studio:claude_code:5b8d09a7": [
    { kind: "user", text: "git post-commit hook으로 rtv session capture를 백그라운드에서 띄우려는데, 다른 hook과 충돌 안 나게 어떻게 짜야해?" },
    { kind: "assistant", text: "표준 패턴은 (1) 우리 hook을 `.git/hooks/post-commit.d/`로 분리하고 (2) `post-commit`은 단순 dispatch만 하게 하는 것. husky 같은 도구가 이미 잡고 있으면 chain에 끼워 넣어야 합니다." },
    { kind: "tool", tool: "Bash", args: "ls -la .git/hooks/", result_lines: 14 },
    { kind: "thinking", text: "post-commit이 동기로 길어지면 commit 체감이 느려져 사용자 불만. nohup + & 로 detach. stdout/stderr는 ~/.rtv-client/logs/hooks.log로." },
    { kind: "tool", tool: "Edit", args: "scripts/install-hook.sh", diff: "+62 −0" },
    { kind: "tool", tool: "Edit", args: "src/cli/git-hook.ts",     diff: "+118 −2" },
    { kind: "user", text: "husky 같은 매니저 있을 때는?" },
    { kind: "assistant", text: "감지하면 husky 스크립트 끝부분에 한 줄 append합니다 (멱등 마커로 중복 방지). 없으면 우리 dispatcher를 그대로 설치." },
    { kind: "tool", tool: "Bash", args: "git commit --allow-empty -m 'spike: hook'", summary: "hook fired · daemon enqueued tx · 47ms" },
    { kind: "assistant", text: "PoC 통과. detach 47ms, blocking 없음. 다음 세션에서 husky/lefthook 두 케이스 통합 테스트." },
  ],

  // --- retriever / collector perf (codex, stalled) ---
  "mac_studio:codex:s_2026_04_25_a": [
    { kind: "user", text: "collector가 큰 vault에서 너무 느림. 매번 전체 walk 하는 거 같은데 incremental로 바꿀 수 있나?" },
    { kind: "tool", tool: "Read", args: "src/collector.ts", result_lines: 312 },
    { kind: "assistant", text: "현재는 mtime 기반 walk만 있어 git이 아닌 디렉터리에서 안 통하는 경우가 있습니다. content_hash 캐시 + 부모 디렉터리 mtime 단축경로 둘 다 도입하겠습니다." },
    { kind: "tool", tool: "Edit", args: "src/cache/hash.ts",  diff: "+88 −0" },
    { kind: "tool", tool: "Edit", args: "src/collector.ts",   diff: "+34 −12" },
    { kind: "tool", tool: "Bash", args: "node --prof bench/collector.js", summary: "profiling — fs.statSync hot path 38%" },
    { kind: "thinking", text: "statSync가 hot path. fs.promises로 옮기고 Concurrency 16으로 묶으면 I/O 스래시 줄어들 듯. 다만 vault 크기에 따라 튜닝 필요." },
    { kind: "assistant", text: "1차 결과: 전체 walk 4.2s → 1.1s, 캐시 적중 시 0.18s. 다만 캐시 무효화가 디렉터리 이동에 약합니다. 이 부분 더 파야 합니다." },
    { kind: "user", text: "캐시 무효화는 다음에. 일단 머지 가능?" },
    { kind: "assistant", text: "회귀 테스트 3건 실패 — 심볼릭 링크 케이스. 이번 세션에선 못 메지합니다. 정리 후 다음 세션에서 재개." },
  ],

  // --- icube-quality / R-D20 tuning (codex, completed) ---
  "mac_studio:codex:s_2026_04_17_b": [
    { kind: "user", text: "R-D20 false-positive 너무 많아. 이번 주 알람 412개 중 유효한 게 38개야. threshold 조정하자." },
    { kind: "tool", tool: "Read", args: "rules/R-D20.sql", result_lines: 84 },
    { kind: "tool", tool: "Bash", args: "psql -f scripts/sample-fp.sql | head -50", summary: "FP 샘플 50건 추출" },
    { kind: "assistant", text: "샘플 보면 '거래량 0인 종목'이 73%를 차지합니다. R-D20에 `volume > 0` 가드 추가하면 단번에 줄어듭니다. 대신 진짜로 0거래·0가격이면 다른 룰(R-V03)이 잡아줘야 하니 회귀 비교 필요." },
    { kind: "user", text: "ADR 먼저 써라. 룰 변경은 ADR 통과 후." },
    { kind: "tool", tool: "Edit", args: "docs/ADR-012.md", diff: "+76 −0", summary: "ADR-012 룰 튜닝 정책 (yaml 단일 파일)" },
    { kind: "assistant", text: "ADR-012 작성 완료. 핵심: (1) 룰은 SQL+yaml 페어, (2) 변경은 회귀 fixture 통과해야 머지, (3) FP/FN 모두 측정." },
    { kind: "tool", tool: "Edit", args: "rules/R-D20.sql",            diff: "+4 −1" },
    { kind: "tool", tool: "Edit", args: "tests/fixtures/auditor.csv", diff: "+18 −0" },
    { kind: "tool", tool: "Bash", args: "npm run test:rules", summary: "12 passed · FP↓ 73% · FN unchanged" },
    { kind: "assistant", text: "회귀 통과. 알람 412→112건 추정. 다음 주 실데이터로 재검증." },
  ],

  // --- wmux / namedpipe IPC stalled ---
  "mac_studio:claude_code:f7c2a013": [
    { kind: "user", text: "Windows에서 named pipe가 자꾸 ERROR_ACCESS_DENIED. 같은 코드가 Linux/macOS는 멀쩡한데." },
    { kind: "tool", tool: "Read", args: "crates/ipc/src/pipe.rs", result_lines: 218 },
    { kind: "thinking", text: "Windows named pipe는 SECURITY_ATTRIBUTES 명시 안 하면 기본 SYSTEM-only ACL. 같은 user 다른 process에서 열어도 막힘. SDDL로 'D:(A;;GA;;;WD)' 정도는 줘야 함." },
    { kind: "assistant", text: "ACL 설정이 빠졌습니다. CreateNamedPipe 호출 시 SECURITY_ATTRIBUTES에 SDDL을 명시해야 합니다 — 아니면 기본 ACL이 너무 엄격해서 같은 사용자라도 막혀요." },
    { kind: "tool", tool: "Edit", args: "crates/ipc/src/pipe.rs", diff: "+34 −2" },
    { kind: "tool", tool: "Bash", args: "cargo test --target x86_64-pc-windows-msvc ipc::", summary: "FAILED — STATUS_ACCESS_DENIED 잔존" },
    { kind: "tool", tool: "Bash", args: "Get-Acl \\\\.\\pipe\\wmux | fl", summary: "ACL 확인 — SDDL 적용됨, 그러나 client connect 단계에서 막힘" },
    { kind: "thinking", text: "흠. 서버 측 ACL은 통과인데 client connect에서 막히는 건 다른 문제. impersonation level? UAC? privileged: true로 띄우면 통과한다고 했었고. 일단 거기서 멈춤." },
    { kind: "assistant", text: "임시로 `privileged: true`에서만 동작하는 빌드입니다. 비관리자 환경에서 동작시키려면 service 형태로 분리해야 할 듯 — 다음 세션 주제." },
    { kind: "user", text: "stalled로 표시해두자." },
  ],

  // --- vault notes (no-git) ---
  "mac_studio:claude_code:e3a8f11d": [
    { kind: "user", text: "오늘 데일리 노트 정리하고 ADR-012 발행. vault 안에서만 작업." },
    { kind: "tool", tool: "Read", args: "2026-04-25.md", result_lines: 22 },
    { kind: "tool", tool: "Edit", args: "2026-04-25.md", diff: "+38 −4", summary: "decision log + tomorrow tasks" },
    { kind: "tool", tool: "Edit", args: "ADR-012 rule-tuning.md", diff: "+12 −0", summary: "발행 표시 + 링크" },
    { kind: "assistant", text: "데일리 노트에 오늘 결정 3건과 내일 할 일 5개 정리했습니다. ADR-012는 published 상태로 표시." },
    { kind: "user", text: "Retriever.md에 이번 주 backlog 합쳐줘." },
    { kind: "tool", tool: "Edit", args: "Retriever.md", diff: "+24 −6" },
    { kind: "assistant", text: "backlog 갱신 완료. vault는 git 없는 디렉터리라 명시 capture로만 수집됨 — `rtv session capture --vault`로 강제 푸시 권장." },
  ],

  // --- mac_laptop retriever (short) ---
  "mac_laptop:claude_code:b9e0d234": [
    { kind: "user", text: "노트북에서 cli 빌드 깨졌어. 'Cannot find module ./db/database.js'." },
    { kind: "tool", tool: "Bash", args: "node --version && npm --version", summary: "v20.11.1 / 10.2.4" },
    { kind: "tool", tool: "Bash", args: "npm run build 2>&1 | head -40" },
    { kind: "thinking", text: "ESM .js 확장자 누락 패턴. tsconfig moduleResolution: 'node16'에서 흔한 문제. 누가 import 줄에서 .js 빠뜨렸음." },
    { kind: "tool", tool: "Bash", args: "git diff HEAD~3 src/cli.ts | head -30" },
    { kind: "assistant", text: "최근 커밋에서 `import './db/database'`로 수정됐습니다 — `'./db/database.js'`여야 합니다 (ESM)." },
    { kind: "tool", tool: "Edit", args: "src/cli.ts", diff: "+1 −1" },
    { kind: "tool", tool: "Bash", args: "npm run build", summary: "ok · 0 errors" },
    { kind: "assistant", text: "원격으로 작은 패치. 같은 패턴이 다른 파일에도 있으면 다음에 일괄 정리합시다." },
  ],

  // --- mbo_tally weekly export (codex completed) ---
  "mac_laptop:codex:s_2026_04_26_c": [
    { kind: "user", text: "주간 export PDF 만들어야 하는데, MBO 항목별로 한 페이지씩 나오게 해줘." },
    { kind: "tool", tool: "Read", args: "src/exporter/weekly.ts", result_lines: 96 },
    { kind: "assistant", text: "현재 페이지 분기 없이 줄바꿈으로만 가르고 있어서, page-break-after 룰을 추가하고 항목별 wrapper에 className을 줍니다." },
    { kind: "tool", tool: "Edit", args: "src/exporter/weekly.ts",  diff: "+18 −4" },
    { kind: "tool", tool: "Edit", args: "src/exporter/styles.css", diff: "+6 −0" },
    { kind: "tool", tool: "Bash", args: "npm run export:weekly -- --week 2026-W17", summary: "PDF 8 pages · 1 page per MBO item" },
    { kind: "assistant", text: "8개 항목, 페이지당 1개로 출력됩니다. 표 너비가 좁아 보이면 다음에 grid 재정렬 — review 단계." },
  ],

  // --- linux_dev rule tuning (active claude_code) ---
  "linux_dev:claude_code:8c1e7790": [
    { kind: "user", text: "feat/rule-tuning 브랜치에서 R-D20 회귀 테스트 돌려보자." },
    { kind: "tool", tool: "Bash", args: "git status && git log --oneline -5" },
    { kind: "tool", tool: "Bash", args: "npm run test:rules -- --grep R-D20", summary: "8 passed · 1 failed (sample 412 — duplicate rows)" },
    { kind: "thinking", text: "duplicate row가 들어오는 케이스. R-D20은 종목·일자 unique를 가정하는데 fixture에 중복이 있음. 룰을 고치는 게 아니라 fixture를 정리해야 함." },
    { kind: "assistant", text: "실패 1건은 fixture 중복 — 룰 자체는 정상. fixture를 dedupe하고 회귀 다시 돌리겠습니다." },
    { kind: "tool", tool: "Edit", args: "tests/fixtures/sample-412.csv", diff: "+0 −12" },
    { kind: "tool", tool: "Bash", args: "npm run test:rules -- --grep R-D20", summary: "9 passed" },
    { kind: "assistant", text: "회귀 통과. 머지 가능 상태. PR 본문 작성해드릴까요?" },
  ],
};

function fallbackTranscript(s) {
  return [
    { kind: "user", text: `${s.goal} — 이 세션에서 진행해보자.` },
    { kind: "assistant", text: s.summary },
    ...Object.entries(s.tools || {}).slice(0, 3).map(([t, n]) => ({
      kind: "tool", tool: t, args: s.files[0] || "(workspace)", summary: `${n} call${n === 1 ? "" : "s"}`,
    })),
    { kind: "assistant", text: `outcome · ${s.outcome}.` },
  ];
}

const TOOL_GLYPH = {
  Edit:   { glyph: "✎", color: "#C26F4A" },
  Read:   { glyph: "◎", color: "#4A6B8A" },
  Write:  { glyph: "✚", color: "#C26F4A" },
  Bash:   { glyph: "$", color: "#5A8C6F" },
  "rtv_*": { glyph: "▣", color: "#A88467" },
};

function SessionChat({ s, onCopy, copied }) {
  // Live data from /api/sessions/:uid?events=1 takes priority when present.
  const isLive = Array.isArray(s.live_turns) && s.live_turns.length > 0;
  const transcript = isLive
    ? s.live_turns
    : (CHAT_TRANSCRIPTS[s.uid] || fallbackTranscript(s));
  const totalShown = transcript.length;
  const harnessLabel = s.harness === "claude_code" ? "Claude Code" : s.harness === "codex" ? "Codex" : s.harness;

  // For mock turns w/o ts, fall back to interpolated time across started_at → last_active.
  const start = new Date((s.started_at || "").replace(" ", "T")).getTime() || 0;
  const end   = new Date((s.last_active || "").replace(" ", "T")).getTime() || start;
  const tsAt = (m, i) => {
    if (m.ts) return rtvFmtTimeLocal(m.ts);
    if (!start) return "";
    const t = new Date(start + ((end - start) * i) / Math.max(1, totalShown - 1));
    return t.toISOString().slice(11, 16);
  };

  return (
    <div>
      {/* Chat header bar */}
      <div className="flex items-center gap-2 mb-3 text-[11px] font-mono flex-wrap" style={{ color: "#8A8680" }}>
        <span style={{ color: "#5C5A55" }}>chat with</span>
        <span className="text-[#1A1A1A]">{harnessLabel}</span>
        <span>·</span>
        <span>{s.started_at} → {s.ended_at || "(ongoing)"}</span>
        <span>·</span>
        <span>{s.events} total events</span>
        {isLive && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: "#E8F0EA", color: "#5A8C6F" }}>● live</span>
        )}
        <span className="ml-auto inline-flex gap-1">
          <button onClick={() => onCopy(`rtv session show ${s.uid}`, `${s.uid}:cmd`)}
                  className="px-2 py-1 rounded border" style={{ borderColor: "#E8E6DE", background: "#FFFFFF", color: copied === `${s.uid}:cmd` ? "#5A8C6F" : "#5C5A55" }}>
            {copied === `${s.uid}:cmd` ? "copied" : `rtv session show ${s.uid.slice(-8)}`}
          </button>
        </span>
      </div>

      {/* Conversation thread */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#E8E6DE", background: "#F7F5EE" }}>
        <div className="rtv-chat-thread px-3 sm:px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {transcript.map((m, i) => (
            <ChatTurn key={i} m={m} ts={tsAt(m, i)} harness={s.harness}/>
          ))}
          {!isLive && totalShown < s.events && (
            <div className="text-center py-2 text-[10px] font-mono" style={{ color: "#A88467" }}>
              … {s.events - totalShown} more events not rendered (run <span className="text-[#1A1A1A]">rtv session show</span> for full)
            </div>
          )}
          {/* Composer ghost */}
          <div className="pt-2 mt-2 border-t flex items-center gap-2 text-[11px] font-mono"
               style={{ borderColor: "#E8E6DE", color: "#A88467" }}>
            <span>›</span>
            <span style={{ fontStyle: "italic" }}>
              {s.status === "active" ? "session ongoing — open in harness to continue"
                                     : "session archived — use Resume tab to reopen on another machine"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// "2026-04-29T17:08:18.123Z" → "17:08" (local-ish; KST already inside ISO)
function rtvFmtTimeLocal(iso) {
  if (!iso) return "";
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "";
}

// Render text with fenced ```code``` blocks + inline markdown (code, bold, links).
// Italic intentionally not supported — `*` is too prone to false matches in
// Korean / bullet text. All output uses React nodes (never innerHTML) so XSS is impossible.
function renderRichText(text) {
  if (!text) return null;
  const parts = [];
  let lastIdx = 0;
  const re = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push({ kind: "text", value: text.slice(lastIdx, m.index) });
    parts.push({ kind: "code", lang: m[1] || "", value: m[2] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push({ kind: "text", value: text.slice(lastIdx) });
  if (parts.length === 0) parts.push({ kind: "text", value: text });
  return parts.map((p, i) => {
    if (p.kind === "code") {
      return (
        <pre key={i} className="rtv-code-block my-2 p-2.5 rounded border overflow-x-auto text-[12px] font-mono leading-relaxed"
             style={{ borderColor: "#E8E6DE", background: "#FDFCF7", color: "#1A1A1A" }}>
          {p.lang && <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "#A88467" }}>{p.lang}</div>}
          <code style={{ whiteSpace: "pre" }}>{p.value}</code>
        </pre>
      );
    }
    return (
      <span key={i} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {renderInlineMarkdown(p.value)}
      </span>
    );
  });
}

/**
 * Pure tokenizer — splits text into a flat array of inline tokens.
 * Exported on window so it's directly unit-testable from Node (no React deps).
 *
 *   tokens = [{ kind: "text"|"code"|"bold"|"link", value, url? }, ...]
 *
 * Italic intentionally absent (Korean/bullet false-match risk).
 */
function rtvTokenizeInlineMd(s) {
  if (!s) return [];
  const out = [];
  let i = 0;
  while (i < s.length) {
    let earliest = -1;
    let pick = null;
    for (const kind of ["code", "bold", "link"]) {
      const m = rtvMatchAt(s, i, kind);
      if (m && (earliest === -1 || m.start < earliest)) {
        earliest = m.start;
        pick = { kind, ...m };
      }
    }
    if (!pick) {
      if (i < s.length) out.push({ kind: "text", value: s.slice(i) });
      break;
    }
    if (pick.start > i) out.push({ kind: "text", value: s.slice(i, pick.start) });
    out.push(pick.kind === "link"
      ? { kind: "link", value: pick.body, url: pick.url }
      : { kind: pick.kind, value: pick.body });
    i = pick.end;
  }
  return out;
}

function rtvMatchAt(s, from, kind) {
  if (kind === "code") {
    const re = /`([^`\n]+)`/g; re.lastIndex = from;
    const m = re.exec(s);
    return m ? { start: m.index, end: m.index + m[0].length, body: m[1] } : null;
  }
  if (kind === "bold") {
    const re = /\*\*([^*\n]+)\*\*/g; re.lastIndex = from;
    const m = re.exec(s);
    return m ? { start: m.index, end: m.index + m[0].length, body: m[1] } : null;
  }
  if (kind === "link") {
    const re = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g; re.lastIndex = from;
    const m = re.exec(s);
    return m ? { start: m.index, end: m.index + m[0].length, body: m[1], url: m[2] } : null;
  }
  return null;
}

// Expose tokenizer for unit testing
if (typeof window !== "undefined") window.rtvTokenizeInlineMd = rtvTokenizeInlineMd;

function renderInlineMarkdown(s) {
  if (!s) return null;
  const tokens = rtvTokenizeInlineMd(s);
  if (tokens.length === 0) return s;
  return tokens.map((t, i) => {
    if (t.kind === "code") {
      return (
        <code key={i} className="rtv-inline-code px-1 py-0.5 rounded text-[12px] font-mono"
              style={{ background: "#F3F1EC", color: "#8F4E2C", border: "1px solid #E8E6DE" }}>
          {t.value}
        </code>
      );
    }
    if (t.kind === "bold") {
      return <strong key={i} className="font-semibold">{t.value}</strong>;
    }
    if (t.kind === "link") {
      return (
        <a key={i} href={t.url} target="_blank" rel="noopener noreferrer"
           className="underline" style={{ color: "#4A6B8A" }}>
          {t.value}
        </a>
      );
    }
    return <span key={i}>{t.value}</span>;
  });
}

function ChatTurn({ m, ts, harness }) {
  if (m.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="rtv-chat-bubble-user">
          <div className="text-[10px] font-mono mb-1 text-right" style={{ color: "#8A8680" }}>you · {ts}</div>
          <div className="px-3.5 py-2.5 rounded-lg rounded-tr-sm text-[13px] leading-relaxed"
               style={{ background: "#FBEFE8", color: "#1A1A1A", border: "1px solid #EDD4C2" }}>
            {renderRichText(m.text)}
          </div>
        </div>
      </div>
    );
  }

  if (m.kind === "assistant" || m.kind === "assistant_block") {
    const isClaudeCode = harness === "claude_code";
    return (
      <div className="flex gap-2.5">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-mono font-semibold"
             style={{ background: isClaudeCode ? "#FBEFE8" : "#E8F0EA",
                      color:      isClaudeCode ? "#8F4E2C" : "#5A8C6F",
                      border: `1px solid ${isClaudeCode ? "#EDD4C2" : "#CADBCF"}` }}>
          {isClaudeCode ? "C" : "X"}
        </div>
        <div className="min-w-0 flex-1 rtv-chat-bubble-assistant">
          <div className="text-[10px] font-mono mb-1" style={{ color: "#8A8680" }}>
            {isClaudeCode ? "Claude Code" : "Codex"} · {ts}
          </div>
          <div className="px-3.5 py-2.5 rounded-lg rounded-tl-sm text-[13px] leading-relaxed"
               style={{ background: "#FFFFFF", border: "1px solid #E8E6DE", color: "#1A1A1A" }}>
            {m.text && <div>{renderRichText(m.text)}</div>}
            {m.kind === "assistant_block" && (
              <div className="mt-2 rounded border overflow-hidden" style={{ borderColor: "#E8E6DE", background: "#FDFCF7" }}>
                <div className="px-2.5 py-1.5 border-b text-[10px] font-mono uppercase tracking-wider"
                     style={{ borderColor: "#E8E6DE", background: "#F7F5EE", color: "#8A8680" }}>{m.title}</div>
                <pre className="p-2.5 m-0 text-[11px] font-mono leading-relaxed text-[#1A1A1A] whitespace-pre">{m.lines.join("\n")}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (m.kind === "thinking") {
    return (
      <div className="flex gap-2.5">
        <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-[12px]"
             style={{ color: "#A88467" }}>◌</div>
        <div className="min-w-0 flex-1 rtv-chat-bubble-assistant">
          <div className="text-[10px] font-mono mb-1" style={{ color: "#A88467" }}>thinking · {ts}</div>
          <div className="px-3.5 py-2.5 rounded-lg text-[12px] leading-relaxed"
               style={{ background: "transparent", border: "1px dashed #D8D4C7", color: "#5C5A55", fontStyle: "italic" }}>
            {renderRichText(m.text)}
          </div>
        </div>
      </div>
    );
  }

  if (m.kind === "tool") {
    return <ToolTurn m={m} ts={ts}/>;
  }

  return null;
}

// Collapsible tool turn — header row always visible; result body toggles open.
function ToolTurn({ m, ts }) {
  const g = TOOL_GLYPH[m.tool] || { glyph: "▸", color: "#5C5A55" };
  const hasResult = !!(m.result || m.result_lines || m.summary || m.diff);
  const longResult = (m.result || "").length > 240 || (m.result_lines || 0) > 6;
  const [open, setOpen] = React.useState(!longResult); // long results collapsed by default

  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-[14px]"
           style={{ color: g.color }}>{g.glyph}</div>
      <div className="min-w-0 flex-1 rtv-chat-bubble-assistant">
        <div className="rounded-lg border overflow-hidden"
             style={{ borderColor: m.is_error ? "#F0C9C0" : "#E8E6DE", background: "#FDFCF7" }}>
          <button
            type="button"
            onClick={() => hasResult && setOpen(o => !o)}
            className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono border-b text-left"
            style={{
              borderColor: "#F0EEE6",
              background: m.is_error ? "#FBEAE6" : "#F7F5EE",
              cursor: hasResult ? "pointer" : "default",
            }}>
            <span className="font-semibold text-[#1A1A1A]">{m.tool}</span>
            <span style={{ color: m.is_error ? "#A83E3E" : "#5C5A55", overflowWrap: "anywhere" }}>
              {m.args || ""}
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5" style={{ color: "#8A8680" }}>
              {m.is_error && <span style={{ color: "#A83E3E" }}>error</span>}
              {hasResult && (
                <span style={{ color: "#A88467" }}>{open ? "▾" : "▸"}</span>
              )}
              <span>{ts}</span>
            </span>
          </button>
          {hasResult && open && (
            <div className="text-[11px] font-mono leading-relaxed" style={{ color: "#1A1A1A" }}>
              {/* Diff/summary inline (mock data) */}
              {(m.diff || m.summary) && (
                <div className="px-3 py-2 flex items-center gap-3 flex-wrap" style={{ color: "#5C5A55" }}>
                  {m.diff && (
                    <span className="inline-flex items-center gap-1">
                      <span style={{ color: "#5A8C6F" }}>{m.diff.split(" ")[0]}</span>
                      <span style={{ color: "#A83E3E" }}>{m.diff.split(" ")[1]}</span>
                    </span>
                  )}
                  {m.summary && <span className="text-[#1A1A1A]">↳ {m.summary}</span>}
                </div>
              )}
              {/* Live result text — full output, mono, max-h with scroll */}
              {m.result && (
                <pre className="px-3 py-2 m-0 max-h-[280px] overflow-auto"
                     style={{
                       background: "#FBFAF4",
                       borderTop: "1px solid #F0EEE6",
                       whiteSpace: "pre",
                       color: m.is_error ? "#A83E3E" : "#1A1A1A",
                     }}>{m.result}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SessionChat });
