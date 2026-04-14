# Retriever

Cross-LLM 하네스 동기화 MCP 서버. Claude Code, Codex 등 여러 LLM 코딩 도구에서 **동일한 에이전트 경험**을 제공합니다.

## 컨셉

쿠버네틱스 패턴: **desired-state 선언 → actual-state 수집 → diff → 승인 → 수렴**

```
┌─────────────────────────────────────────┐
│          LLM Tool (Claude Code, Codex)  │
│                    │ MCP Protocol        │
│          ┌─────────▼──────────┐         │
│          │  Retriever Server  │         │
│          │  Collector │ Differ │         │
│          │  Projector │ Memory │         │
│          └─────────┬──────────┘         │
│                    │ File I/O            │
│          ┌─────────▼──────────┐         │
│          │  Obsidian Vault    │         │
│          │  (Shared Store)    │         │
│          └────────────────────┘         │
└─────────────────────────────────────────┘
```

## 기능

### MCP 도구 (11개)

| 그룹 | 도구 | 역할 |
|------|------|------|
| 초기화 | `rtv_init` | 프로젝트 등록 + manifest 생성 |
| 조회 | `rtv_status` | desired vs actual 전체 리포트 |
| | `rtv_diff` | 항목별 상세 diff |
| | `rtv_projects` | 등록된 프로젝트 목록 |
| 수집 | `rtv_collect` | 로컬 상태 스냅샷 수집 |
| 적용 | `rtv_apply` | 승인된 diff를 로컬에 반영 |
| 메모리 | `rtv_memory_list` | 메모리 목록 (글로벌+프로젝트 병합) |
| | `rtv_memory_search` | 키워드 검색 |
| | `rtv_memory_read` | 상세 읽기 |
| | `rtv_memory_write` | 생성/수정 |
| | `rtv_memory_delete` | 삭제 |

### Hooks

| Hook | 역할 |
|------|------|
| `SessionStart` | 세션 시작 시 하네스 점검 → 불일치 경고 |
| `SessionEnd` | 세션 종료 시 요약 추출 → 볼트 메모리에 자동 저장 |

### 어댑터

| 도구 | 감지 기준 | 하네스 파일 |
|------|----------|------------|
| Claude Code | `CLAUDE.md`, `.claude/` | CLAUDE.md, .claude/rules/*.md |
| Codex | `.codex/` | .codex/instructions.md |

### 세션 마이닝

과거 세션에서 패턴(반복 실수, 병목, 효과적 접근법)을 추출하여 메모리에 저장합니다.

```bash
# Phase A: 세션 인덱싱
node scripts/mine-sessions.mjs

# Phase B: Ollama로 패턴 추출 (Mac Studio 등 로컬 LLM)
OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL=gemma3 \
  node scripts/mine-sessions.mjs --ollama
```

## 설치

```bash
git clone https://github.com/Deok-ho/retriever.git
cd retriever
npm install
npm run build
```

### Claude Code MCP 등록

`~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "retriever": {
      "command": "node",
      "args": ["<path-to>/retriever/dist/index.js"],
      "env": {
        "RTV_STORE_PATH": "<path-to-vault>/91_Retriever-Store",
        "RTV_DEVICE_NAME": "MY-PC"
      }
    }
  }
}
```

### Hooks 등록

`~/.claude/settings.json`의 `hooks`에 추가:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node \"<path-to>/retriever/scripts/session-start-hook.mjs\"",
        "timeout": 15,
        "statusMessage": "하네스 점검 중..."
      }]
    }],
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "node \"<path-to>/retriever/scripts/session-end-hook.mjs\"",
        "timeout": 30,
        "statusMessage": "세션 요약 → 볼트 저장 중..."
      }]
    }]
  }
}
```

## 공유 스토어 구조

```
91_Retriever-Store/
├── personas.yaml                    # Git 페르소나 정의
├── global/
│   ├── CLAUDE.md                    # 글로벌 규칙
│   ├── settings.yaml                # 글로벌 설정
│   ├── rules/                       # 모든 프로젝트에 적용
│   └── memory/                      # 글로벌 메모리
├── desired-state/{project}/
│   ├── manifest.yaml                # 프로젝트 선언
│   ├── rules/                       # 프로젝트 전용 규칙
│   └── memory/                      # 프로젝트 전용 메모리
└── devices/{device}/{project}/
    ├── snapshot.yaml                # 로컬 상태 스냅샷
    ├── memory/                      # Claude Code 메모리 백업
    └── sessions/index-detailed.json # 세션 인덱스
```

## 멀티 디바이스 아키텍처

```
ASUS_WIN01 (Windows)              MAC_STUDIO (macOS)
  Claude Code 세션                  Ollama + Gemma 4 (마이닝)
  SessionStart/End hooks            mine-sessions.mjs --ollama
       │                                │
       ▼                                ▼
  ┌──────────────────────────────────────────┐
  │     Obsidian Vault (Obsidian Sync)       │
  │     91_Retriever-Store/                  │
  └──────────────────────────────────────────┘
```

- **ASUS_WIN01**: 세션 생성 + hooks로 실시간 수집
- **MAC_STUDIO**: 로컬 LLM으로 세션 마이닝 (API 비용 0)
- **동기화**: Obsidian Sync (유료)

## 개발

```bash
npm test          # 테스트 실행 (74 tests)
npm run build     # TypeScript 빌드
npm run dev       # watch 모드
```

## 로드맵

- [x] Phase 1: MVP — init/collect/status/diff/apply/projects + Claude Code 어댑터
- [x] Phase 2: Memory Hub + Codex 어댑터 + Watchdog + Hooks
- [ ] Phase 3: Supabase 저장소 (self-hosted, pgvector) + 실시간 동기화
- [ ] Phase 4: Gemini CLI / Antigravity 어댑터

## License

MIT
