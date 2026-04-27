// Retriever — mock data

const TODAY = "2026-04-25";

const PROJECTS = [
  { id: "retriever",              phase: "phase3a", health: "green",  active: 3, stalled: 0, done_week: 2, priority: 1, label: "Retriever" },
  { id: "wmux",                   phase: "mvp",     health: "yellow", active: 2, stalled: 1, done_week: 0, priority: 2, label: "wmux" },
  { id: "obsidian_ai_terminal",   phase: "design",  health: "green",  active: 1, stalled: 0, done_week: 1, priority: 3, label: "Obsidian AI Terminal" },
  { id: "icube_quality",          phase: "D4",      health: "red",    active: 2, stalled: 2, done_week: 0, priority: 4, label: "iCUBE Quality" },
  { id: "mbo_tally",              phase: "v0",      health: "green",  active: 1, stalled: 0, done_week: 1, priority: 5, label: "MBO Tally" },
];

const TICKETS = [
  {
    task_id: "gemma4_adapter", project: "retriever", status: "done", priority: "high",
    task_type: "구현", summary: "Gemma4 런타임 MCP 어댑터 추가",
    attachments: 2, est_h: 4, actual_h: 3.5,
    created: "2026-04-21 09:14", updated: "2026-04-23 16:02",
    criteria: [
      { text: "Ollama JSON 모드 호출 성공", done: true,  evidence: "session 2026-04-22 #7" },
      { text: "6종 메서드 모두 구현",        done: true,  evidence: "commit 8f3a91c" },
      { text: "단위 테스트 10개 이상",       done: true,  evidence: "tests/adapters/gemma4.test.ts — 12 passed" },
    ],
    body: "Ollama 로컬 런타임을 `BaseAdapter` 시그니처에 맞춰 얇게 래핑. JSON 모드는 `format:'json'`로 강제하고 파싱 실패 시 1회 재시도. 타임아웃 60s, 기본 모델 gemma4:26b-a4b-it-q8_0.\n\n구조는 `src/adapters/gemma4.ts`에 단일 클래스. 프롬프트 템플릿은 분리해서 `gemma4-prompts.ts`로.",
  },
  {
    task_id: "namedpipe_ipc", project: "wmux", status: "blocked", priority: "high",
    task_type: "리서치", summary: "NamedPipe 기반 세션 IPC 프로토타입",
    attachments: 4, est_h: 8, actual_h: 5,
    created: "2026-04-14 11:02", updated: "2026-04-20 17:48",
    stalled_since: "2026-04-20",
    blocked_reason: "외부 리뷰 대기 (Windows 커널 팀)",
    criteria: [
      { text: "통신 레이턴시 < 10ms 확인",       done: false, evidence: null },
      { text: "멀티세션 핸드셰이크 재현 성공",   done: false, evidence: null },
    ],
    body: "WSL ↔ Windows 네이티브 간 세션 IPC. AF_UNIX 대비 NamedPipe의 **실측 레이턴시**와 **동시 연결 상한**을 먼저 검증해야 설계 확정 가능.",
  },
  {
    task_id: "intake_draft", project: "retriever", status: "todo", priority: "med",
    task_type: "구현", summary: "rtv_create_ticket MCP 툴 — intake 플로우",
    attachments: 0, est_h: 3,
    created: "2026-04-24 10:30", updated: "2026-04-24 10:30",
    criteria: [
      { text: "자연어 → 프론트매터 분류 (Gemma4)", done: false },
      { text: "중복 티켓 감지 (임베딩 코사인)",    done: false },
      { text: "ticket.md + attachments/ 생성",     done: false },
    ],
    body: "유저의 한 문장 요청을 받아 `ticket.md` 번들을 생성. Gemma4가 task_type / priority / est_h / completion criteria 초안까지 작성.",
  },
  {
    task_id: "summary_cache", project: "retriever", status: "in_progress", priority: "high",
    task_type: "구현", summary: "_derived/summary.md 캐시 무효화 전략",
    attachments: 3, est_h: 5, actual_h: 2.5,
    created: "2026-04-23 13:22", updated: "2026-04-25 09:02",
    criteria: [
      { text: "attachments/ 해시 변경 감지",   done: true,  evidence: "utils/hash.ts" },
      { text: "Stale 뱃지 UI 연동",            done: false },
      { text: "재생성 시 이전 버전 아카이브",  done: false },
    ],
    body: "요약 재생성 비용을 줄이기 위해 첨부물 디렉토리 전체의 content hash를 `_derived/summary.meta`에 기록. 해시가 바뀌면 stale 표시만 하고 자동 재생성은 하지 않음 — 유저가 명시적으로 트리거.",
  },
  {
    task_id: "watchdog_tune", project: "wmux", status: "in_progress", priority: "med",
    task_type: "구현", summary: "Watchdog polling 주기 튜닝 (30s → adaptive)",
    attachments: 1, est_h: 2, actual_h: 0.5,
    created: "2026-04-24 14:02", updated: "2026-04-25 08:40",
    criteria: [
      { text: "idle 시 60s, active 시 10s", done: false },
      { text: "배터리 모드 감지",            done: false },
    ],
    body: "고정 30s 폴링이 배터리 시 과다. 세션 활동도 기준으로 10~120s 범위 지수 백오프.",
  },
  {
    task_id: "terminal_design_v2", project: "obsidian_ai_terminal", status: "review", priority: "med",
    task_type: "디자인", summary: "Obsidian AI Terminal v2 레이아웃",
    attachments: 5, est_h: 6, actual_h: 7,
    created: "2026-04-18 09:00", updated: "2026-04-24 19:15",
    criteria: [
      { text: "3-pane 레이아웃 확정",              done: true,  evidence: "figma link" },
      { text: "Command palette interaction spec",  done: true,  evidence: "attachments/design-spec.md" },
      { text: "접근성 리뷰 통과",                  done: false },
    ],
    body: "Obsidian 내장 터미널 + AI 보조 UI. 좌측 볼트 트리, 중앙 터미널, 우측 AI 제안.",
  },
  {
    task_id: "auditor_false_positives", project: "icube_quality", status: "stalled", priority: "high",
    task_type: "튜닝", summary: "R-D20 오탐 튜닝 — 신규 매입 단가 급등 케이스",
    attachments: 6, est_h: 4, actual_h: 3,
    created: "2026-04-15 10:10", updated: "2026-04-18 16:20",
    stalled_since: "2026-04-18",
    criteria: [
      { text: "최근 7일 입고단가 변동률 조건 추가",  done: false },
      { text: "거래처 대량할인 계약 메타 반영",      done: false },
    ],
    body: "R-D20(원가 역전 출고) 파일럿에서 오탐 12건 중 9건이 동일 패턴 — 매입가 급등 직후 기존 재고 판매. 최근 7d 입고단가 변동률을 예외 조건에 추가.",
  },
  {
    task_id: "sessionend_hook", project: "retriever", status: "in_progress", priority: "med",
    task_type: "구현", summary: "SessionEnd hook — 볼트 메모리 자동 저장",
    attachments: 2, est_h: 3, actual_h: 1.5,
    created: "2026-04-24 15:40", updated: "2026-04-25 07:15",
    criteria: [
      { text: "요약 추출 → global/memory/에 저장", done: false },
      { text: "태그 자동 분류",                     done: false },
    ],
    body: "Claude Code 세션 종료 시 hook이 transcript를 받아 Gemma4로 3문장 요약 + 태그를 생성하고 공유 볼트에 기록.",
  },
  {
    task_id: "stalled_dedup", project: "icube_quality", status: "stalled", priority: "med",
    task_type: "리서치", summary: "이슈 중복 클러스터링 (동일 전표 재발견)",
    attachments: 1, est_h: 2,
    created: "2026-04-10 10:00", updated: "2026-04-11 14:10",
    stalled_since: "2026-04-11",
    criteria: [ { text: "voucher_id 해시 기반 dedup", done: false } ],
    body: "같은 전표가 두 번 올라오는 현상. heartbeat 간 window가 겹치는 경우.",
  },
  {
    task_id: "tally_mvp", project: "mbo_tally", status: "in_progress", priority: "high",
    task_type: "구현", summary: "MBO Tally v0 — 월별 집계 뷰",
    attachments: 2, est_h: 5, actual_h: 2,
    created: "2026-04-22 09:30", updated: "2026-04-25 08:20",
    criteria: [
      { text: "Supabase 스키마 확정",  done: true,  evidence: "schema/v0.sql" },
      { text: "월별 피벗 쿼리",        done: false },
      { text: "CSV export",            done: false },
    ],
    body: "사업소득 장부. 공업사스토어와 데이터 경계 엄격 분리.",
  },
  {
    task_id: "codex_adapter_perf", project: "retriever", status: "review", priority: "med",
    task_type: "구현", summary: "Codex 어댑터 — collect 성능 최적화",
    attachments: 3, est_h: 3, actual_h: 2.5,
    created: "2026-04-22 11:00", updated: "2026-04-24 18:00",
    criteria: [
      { text: ".codex/ 증분 스캔",     done: true,  evidence: "collector.ts L142" },
      { text: "대용량 instructions 분할", done: true },
      { text: "통합 테스트 추가",      done: false },
    ],
    body: "전체 스캔 대신 mtime 증분 + 해시 비교로 전환.",
  },
];

// Attachments keyed by task_id
const ATTACHMENTS = {
  gemma4_adapter: [
    { id: "a1", kind: "session", name: "session-2026-04-22-adapter.md", added: "2026-04-22 16:04", size: "18 KB", preview: "`rtv_collect` 호출 후 Ollama가 JSON 파싱 실패 → `format:'json'` 강제로 해결. 6개 메서드 중 `embed()`만 별도 엔드포인트(/api/embeddings)를 타야 함을 확인." },
    { id: "a2", kind: "diff",    name: "src-adapters-gemma4.patch",    added: "2026-04-23 14:48", size: "4 KB",  preview: "+147 / −12 · files: src/adapters/gemma4.ts, gemma4-prompts.ts" },
  ],
  namedpipe_ipc: [
    { id: "b1", kind: "research",  name: "namedpipe-vs-afunix.md",      added: "2026-04-15 10:20", size: "12 KB", preview: "Windows NamedPipe는 기본 1024 동시연결, AF_UNIX는 커널 소켓 수 제한. 레이턴시 실측: NP 2.1ms, AF 0.8ms (loopback, 10B)." },
    { id: "b2", kind: "external",  name: "MSDN: CreateNamedPipeA",      added: "2026-04-15 10:45", size: "—",     preview: "docs.microsoft.com/.../createnamedpipea" },
    { id: "b3", kind: "transcript",name: "meeting-2026-04-18.md",       added: "2026-04-18 15:30", size: "8 KB",  preview: "커널 팀: 공식 API로 밀어붙이지 말고 WSL2 vmbus 활용 추천. — 다음 리뷰 4/28." },
    { id: "b4", kind: "session",   name: "session-2026-04-20-probe.md", added: "2026-04-20 17:48", size: "22 KB", preview: "벤치 스크립트 작성. 초기 결과는 목표치 미달(평균 12ms). 원인: 스레드풀 컨텍스트 스위치." },
  ],
  summary_cache: [
    { id: "c1", kind: "session", name: "session-2026-04-23-hash.md", added: "2026-04-23 15:10", size: "9 KB", preview: "content hash는 디렉토리 전체 파일의 `sha256(sorted(name+content))`로 결정. 퍼포먼스 OK (5개 첨부 기준 12ms)." },
    { id: "c2", kind: "diff",    name: "utils-hash.patch",           added: "2026-04-24 09:22", size: "2 KB", preview: "+ hashDirectory(path) → Promise<string>" },
    { id: "c3", kind: "research",name: "invalidation-strategies.md", added: "2026-04-24 11:00", size: "6 KB", preview: "TTL / hash / manual trigger 3안 비교. 선택: hash + manual (자동 재생성 없음 — LLM 비용 통제)." },
  ],
  watchdog_tune: [
    { id: "d1", kind: "session", name: "session-2026-04-24-watchdog.md", added: "2026-04-24 14:40", size: "6 KB", preview: "30s 고정 → 배터리 20% 초과 소모. 세션 활동 신호 기반 adaptive 필요." },
  ],
  terminal_design_v2: [
    { id: "e1", kind: "external",  name: "figma: Obsidian Terminal v2",  added: "2026-04-18 10:15", size: "—",      preview: "figma.com/file/ABC123" },
    { id: "e2", kind: "research",  name: "design-spec.md",               added: "2026-04-20 14:20", size: "16 KB",  preview: "3-pane 레이아웃 · command palette · 키보드 단축키 체계" },
    { id: "e3", kind: "session",   name: "session-2026-04-22-layout.md", added: "2026-04-22 16:10", size: "11 KB",  preview: "좌 240 / 중앙 flex / 우 360 채택." },
    { id: "e4", kind: "transcript",name: "design-review-2026-04-24.md",  added: "2026-04-24 19:15", size: "9 KB",   preview: "리뷰 피드백: a11y 미흡 — focus ring, aria-live 보완 필요." },
    { id: "e5", kind: "diff",      name: "tokens.patch",                 added: "2026-04-24 20:00", size: "1 KB",   preview: "+ --accent-action, --accent-info, --stalled-amber" },
  ],
  auditor_false_positives: [
    { id: "f1", kind: "research",  name: "R-D20-false-positive-analysis.md", added: "2026-04-15 14:00", size: "14 KB", preview: "12건 중 9건 동일 패턴 — 매입가 +22% 급등 직후 기존 재고 판매." },
    { id: "f2", kind: "session",   name: "session-2026-04-16-rule-tune.md",  added: "2026-04-16 11:20", size: "10 KB", preview: "최근 7d 입고단가 변동률 > 10% 면 R-D20 skip 조건 초안." },
    { id: "f3", kind: "diff",      name: "rules-R-D20-v2.patch",             added: "2026-04-17 16:05", size: "3 KB",  preview: "SQL에 window function 추가." },
    { id: "f4", kind: "transcript",name: "원가담당-미팅-2026-04-18.md",      added: "2026-04-18 15:00", size: "7 KB",  preview: "거래처별 할인계약 메타는 별도 테이블로." },
    { id: "f5", kind: "external",  name: "ADR-012 rule-tuning policy",       added: "2026-04-18 16:10", size: "—",     preview: "문서화된 결정 — 오탐률 목표 < 10%." },
    { id: "f6", kind: "research",  name: "customer-discount-meta-draft.md",  added: "2026-04-18 16:20", size: "5 KB",  preview: "customer_meta.discount_contract 필드 스키마 초안." },
  ],
  codex_adapter_perf: [
    { id: "g1", kind: "diff",    name: "collector-incremental.patch", added: "2026-04-23 10:00", size: "5 KB", preview: "mtime 캐시 + 해시 비교 도입." },
    { id: "g2", kind: "session", name: "session-2026-04-23-perf.md",  added: "2026-04-23 17:30", size: "9 KB", preview: "벤치: 1000 파일 기준 2.4s → 0.3s." },
    { id: "g3", kind: "research",name: "lru-cache-sizing.md",         added: "2026-04-24 09:20", size: "4 KB", preview: "메모리 고정 32MB 제한." },
  ],
  intake_draft: [],
  sessionend_hook: [
    { id: "h1", kind: "session", name: "session-2026-04-24-hook.md", added: "2026-04-24 16:10", size: "7 KB", preview: "transcript 길이 > 20KB 일 때 chunked 요약." },
    { id: "h2", kind: "diff",    name: "hook-skeleton.patch",        added: "2026-04-25 07:00", size: "2 KB", preview: "scripts/session-end-hook.mjs 추가." },
  ],
  stalled_dedup: [
    { id: "s1", kind: "research", name: "dedup-sketch.md", added: "2026-04-11 10:20", size: "3 KB", preview: "voucher_id + rule_id 해시 기반 단순 세트." },
  ],
  tally_mvp: [
    { id: "t1", kind: "diff",    name: "schema-v0.patch",      added: "2026-04-22 15:10", size: "6 KB", preview: "CREATE TABLE transactions, categories, monthly_rollup" },
    { id: "t2", kind: "session", name: "session-2026-04-24.md",added: "2026-04-24 18:00", size: "8 KB", preview: "월별 피벗 쿼리 프로토타입." },
  ],
};

// Pre-composed AI summaries for each ticket
const SUMMARIES = {
  gemma4_adapter: {
    fresh: true,
    regenerated_at: "2026-04-23 16:04",
    attachments_count: 2,
    tokens: 840,
    body: "Gemma4 어댑터가 완성되었습니다. JSON 출력 안정성을 위해 `format:'json'` 플래그를 강제하고, 파싱 실패 시 단 1회 재시도합니다. 6개 MCP 메서드(`complete / chat / embed / classify / summarize / critique`) 모두 구현되었고, 임베딩만 별도 엔드포인트를 탑니다. 단위 테스트 12건 통과.",
  },
  summary_cache: {
    fresh: false,
    regenerated_at: "2026-04-23 15:30",
    attachments_count: 2,
    tokens: 620,
    body: "첨부 디렉토리의 content hash로 stale 여부만 판정하고, 재생성은 유저 명시 트리거로만 수행합니다. LLM 비용을 통제하면서 신선도 신호를 제공하는 절충안입니다.",
    stale_reason: "첨부 1건 추가됨 (invalidation-strategies.md, 2026-04-24 11:00)",
  },
  namedpipe_ipc: {
    fresh: true,
    regenerated_at: "2026-04-20 17:55",
    attachments_count: 4,
    tokens: 1240,
    body: "Windows NamedPipe vs AF_UNIX 벤치 결과, NP는 목표치(10ms) 미달(12ms 평균). 커널 팀은 WSL2 vmbus 활용을 제안했고 4/28 재리뷰 예정. 현재 진행은 **외부 리뷰 대기**로 blocked.",
  },
  terminal_design_v2: {
    fresh: true,
    regenerated_at: "2026-04-24 19:30",
    attachments_count: 5,
    tokens: 980,
    body: "3-pane 레이아웃(좌 240 / 중앙 flex / 우 360) 확정. Command palette 인터랙션 스펙 작성 완료. 남은 블로커는 접근성 리뷰 — focus ring과 aria-live 보완이 필요합니다.",
  },
  auditor_false_positives: {
    fresh: true,
    regenerated_at: "2026-04-18 16:40",
    attachments_count: 6,
    tokens: 1410,
    body: "R-D20 오탐 12건 중 9건이 '매입가 급등 직후 기존 재고 판매' 패턴입니다. 최근 7d 입고단가 변동률 > 10%인 경우 규칙을 스킵하고, 거래처별 대량할인 계약은 별도 메타 테이블로 분리합니다. ADR-012로 문서화 완료.",
  },
};

const ACTIVITY = {
  gemma4_adapter: [
    { t: "2026-04-23 16:04", kind: "status",  text: "status → done" },
    { t: "2026-04-23 15:48", kind: "agent",   text: "Gemma4 — Verify completion · ✓ 모든 3 criteria 충족 (session+commit+tests)" },
    { t: "2026-04-23 14:48", kind: "attach",  text: "첨부 추가 · src-adapters-gemma4.patch" },
    { t: "2026-04-22 16:04", kind: "attach",  text: "첨부 추가 · session-2026-04-22-adapter.md" },
    { t: "2026-04-22 10:12", kind: "agent",   text: "Gemma4 — Classify · task_type=구현, priority=high, 3 criteria" },
    { t: "2026-04-21 09:14", kind: "create",  text: "티켓 생성" },
  ],
  summary_cache: [
    { t: "2026-04-25 09:02", kind: "status", text: "status → in_progress" },
    { t: "2026-04-24 11:00", kind: "attach", text: "첨부 추가 · invalidation-strategies.md" },
    { t: "2026-04-24 09:22", kind: "attach", text: "첨부 추가 · utils-hash.patch" },
    { t: "2026-04-23 15:10", kind: "attach", text: "첨부 추가 · session-2026-04-23-hash.md" },
    { t: "2026-04-23 13:22", kind: "create", text: "티켓 생성" },
  ],
};

const NARRATIVE_WEEK = "이번 주는 Retriever의 Gemma4 어댑터가 완료되어 로컬 LLM 기반 요약·분류 파이프라인이 성립했습니다. 다만 wmux의 NamedPipe IPC는 Windows 커널 팀 리뷰 대기로 나흘째 blocked 상태이고, iCUBE Quality의 R-D20 오탐 튜닝은 일주일간 stalled로 남아 있습니다. 당면 우선순위는 stalled 2건의 외부 의존 해소와 summary_cache의 UI 연동 마무리입니다.";

const STATUS_TRANSITIONS_7D = [
  { d: "04/19", todo: 2, in_progress: 1, review: 0, done: 1, blocked: 0 },
  { d: "04/20", todo: 1, in_progress: 2, review: 0, done: 0, blocked: 1 },
  { d: "04/21", todo: 2, in_progress: 2, review: 1, done: 0, blocked: 1 },
  { d: "04/22", todo: 2, in_progress: 3, review: 1, done: 1, blocked: 1 },
  { d: "04/23", todo: 1, in_progress: 3, review: 2, done: 2, blocked: 1 },
  { d: "04/24", todo: 1, in_progress: 4, review: 2, done: 2, blocked: 1 },
  { d: "04/25", todo: 1, in_progress: 4, review: 2, done: 2, blocked: 1 },
];

Object.assign(window, {
  TODAY, PROJECTS, TICKETS, ATTACHMENTS, SUMMARIES, ACTIVITY, NARRATIVE_WEEK, STATUS_TRANSITIONS_7D,
});
