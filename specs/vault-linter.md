# Vault Linter 설계서

Obsidian 볼트 전용 **AI 린터**. 새벽 배치로 돌며 프론트매터·백링크·태그·허브 노트를
정리하고, 결과는 제안서 파일로 내보낸 뒤 기존 Retriever 의 `desired → diff → apply`
흐름으로 승인·반영한다.

## 1. 목표와 범위

### 1.1 목표
- **프론트매터 표준화**: 모든 노트에 `summary` (한 줄 요약), `tags`, `updated` 보장
- **허브 노트 유지**: MOC(Map of Content) 류 노트의 하위 링크를 자동 제안
- **단어 연결**: 신규·수정 노트의 핵심 개념을 기존 노트와 연결(백링크 후보)
- **태그 위생**: 중복·변형 태그(`#AI`/`#ai`/`#인공지능`) 병합 제안
- **고아/깨진 링크 제거**

### 1.2 비목표 (v1)
- 본문 리라이팅, 문체 교정
- 자동 분류/이동 (폴더 재배치)
- 실시간 린팅 (에디터 플러그인) — 새벽 배치만

### 1.3 운영 원칙
- **파일을 직접 수정하지 않는다**(저위험 필드 auto-apply 는 옵션). 기본은 `proposals.md` 출력.
- **증분 처리**: 해시가 바뀐 노트만 LLM 호출.
- **결정론적 룰이 먼저** 돌고, 통과한 노트만 LLM 단계로 넘어간다.
- **새벽 배치**: Mac Studio 에서 Ollama 로 돌려 API 비용 0.

---

## 2. 아키텍처

```
           03:00 cron / launchd
                   │
      ┌────────────▼────────────┐
      │  scripts/vault-lint.mjs │
      └────────────┬────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐   ┌──────────┐   ┌──────────┐
│ Scan   │   │ Rule     │   │ LLM      │
│ (hash) │──▶│ Engine   │──▶│ Stage    │
│        │   │ (static) │   │ (Ollama) │
└────────┘   └──────────┘   └────┬─────┘
                                  │
                        ┌─────────▼─────────┐
                        │ Proposal Writer   │
                        │ proposals.md      │
                        │ patches/*.diff    │
                        └─────────┬─────────┘
                                  │
                        ┌─────────▼─────────┐
                        │ rtv_apply (수동)  │
                        └───────────────────┘
```

### 2.1 구성 요소

| 컴포넌트 | 책임 |
|---------|------|
| **Scanner** | 볼트 전체 `.md` 워크, 파일 해시 + frontmatter 파싱, `index.sqlite` 갱신 |
| **Rule Engine** | 결정적 규칙(섹션 4) 실행, 위반 목록 생성 |
| **Embedder** | 변경된 노트만 임베딩 계산 → sqlite 의 `embeddings` 테이블에 upsert |
| **LLM Stage** | 요약/허브/연결 추천 (Ollama, 섹션 5) |
| **Proposal Writer** | 위반·추천을 `proposals.md` + 단위 diff 파일로 출력 |
| **Feedback Log** | 승인/거절 기록을 남겨 다음 배치의 추천 품질 개선 |

---

## 3. 저장소 레이아웃

볼트 내 `91_Retriever-Store/` 를 그대로 재사용.

```
91_Retriever-Store/
├── vault-lint/
│   ├── index.sqlite              # 파일 해시 + 임베딩 + 태그 인덱스
│   ├── config.yaml               # 린터 설정 (규칙 on/off, 폴더 제외)
│   ├── feedback.jsonl            # 제안 수락/거절 로그
│   └── runs/
│       └── 2026-04-24/
│           ├── proposals.md      # 사람이 읽는 요약 리포트
│           ├── patches/
│           │   ├── 001-frontmatter-Foo.diff
│           │   ├── 002-hub-AI-index.diff
│           │   └── 003-tag-merge.diff
│           └── stats.json        # 처리 노트 수, LLM 호출 수, 소요 시간
```

### 3.1 `index.sqlite` 스키마 (초안)

```sql
CREATE TABLE notes (
  path        TEXT PRIMARY KEY,        -- 볼트 루트 기준 상대 경로
  hash        TEXT NOT NULL,           -- 본문 sha256
  title       TEXT,                    -- H1 또는 파일명
  frontmatter TEXT,                    -- JSON 직렬화
  mtime       INTEGER,
  last_linted INTEGER                  -- epoch sec, 마지막 성공 배치
);

CREATE TABLE embeddings (
  path        TEXT PRIMARY KEY REFERENCES notes(path) ON DELETE CASCADE,
  model       TEXT NOT NULL,           -- e.g. 'nomic-embed-text'
  dim         INTEGER NOT NULL,
  vector      BLOB NOT NULL            -- float32 * dim
);

CREATE TABLE links (                   -- 위키링크 역인덱스
  src TEXT NOT NULL,
  dst TEXT NOT NULL,                   -- 해석된 경로 (없으면 원문 유지)
  resolved INTEGER NOT NULL,           -- 0/1
  PRIMARY KEY (src, dst)
);

CREATE TABLE tags (
  path TEXT NOT NULL,
  tag  TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);
```

---

## 4. 결정적 규칙 (LLM 없이)

각 규칙은 `ruleId` + 심각도(`error`/`warn`/`info`) + 자동수정 가능 여부를 가진다.

| ruleId | 내용 | 심각도 | auto-apply 후보 |
|--------|------|--------|-----------------|
| `fm/required`        | `summary`, `tags`, `updated` 누락 | error | no (summary는 LLM 단계에서 채움) |
| `fm/tags-array`      | `tags` 가 배열이 아님 / 문자열 섞임 | error | yes |
| `fm/updated-format`  | `updated` 가 ISO 날짜가 아님 | warn | yes (mtime 기준) |
| `link/broken`        | `[[X]]` 가 존재하지 않는 노트 | warn | no |
| `link/ambiguous`     | 같은 basename 이 여러 폴더에 존재 | warn | no |
| `note/orphan`        | 어떤 노트에서도 링크되지 않음 | info | no |
| `note/h1-mismatch`   | H1 과 파일명 불일치 | info | no |
| `tag/case-variant`   | 대소문자만 다른 태그 공존 | warn | yes |
| `tag/unused`         | 한 노트에서만 쓰이는 태그 | info | no |
| `folder/ignored`     | `config.yaml` 의 제외 경로는 스캔 대상에서 제외 | — | — |

자동수정 가능(`auto-apply` 허용) 항목은 `config.yaml` 에서 켤 때만 패치 적용.

---

## 5. LLM 단계 (Ollama)

### 5.1 파이프라인
결정적 검사를 통과(또는 `fm/required` 만 남은) 노트 중 **해시가 바뀐 것만** 대상.

```
변경 노트 집합
  ├─▶ 요약 생성 (summary 필드 채우기)
  ├─▶ 임베딩 계산 → upsert
  ├─▶ 단어 연결: 변경 노트 ↔ 기존 노트 cosine top-K
  ├─▶ 허브 추천: 임베딩 클러스터링 → 중심 노트 선정 → MOC 블록 diff
  └─▶ 태그 정규화: 태그 공출현 + 임베딩으로 유사 태그 병합 제안
```

### 5.2 모델 매트릭스 (기본값, 교체 가능)

| 단계 | 모델 | 근거 |
|------|------|------|
| 요약 | `gemma3:4b` 또는 `gemma3:12b` | 기존 `mine-sessions.mjs` 와 동일 스택 |
| 임베딩 | `nomic-embed-text` | 한국어+영어, 로컬, 빠름 |
| 태그 라벨링 | 요약 모델 재사용 | 별도 로드 피하기 |

### 5.3 프롬프트 규약
- 모든 프롬프트는 `src/vault-lint/prompts/*.md` 에 분리.
- LLM 은 **항상 JSON 으로만** 응답 (파싱 실패 시 1회 재시도 후 스킵).
- 요약 프롬프트 출력 스키마:
  ```json
  { "summary": "한 줄 요약 (80자 이내)", "key_terms": ["용어1", "용어2", "용어3"] }
  ```
- 허브 추천 출력:
  ```json
  { "hub": "AI/LLM 개요", "members": ["프롬프트 엔지니어링", "RAG", "..."],
    "reasoning": "공통 주제 한 문장" }
  ```

### 5.4 비용/시간 가드
- 한 배치에서 LLM 호출 상한: `config.yaml` 의 `llm.max_calls_per_run` (기본 300).
- 초과 시 우선순위: **요약 > 태그 정규화 > 단어 연결 > 허브 추천**.
- 모든 호출은 `runs/<date>/stats.json` 에 토큰/지연 기록.

---

## 6. 제안서 포맷

### 6.1 `proposals.md`
사람이 아침에 훑어보는 문서. 섹션별로 체크박스 + 개별 diff 파일 링크.

```markdown
# Vault Lint Proposals — 2026-04-24

- 스캔 노트: 1,284 / 변경 감지: 37 / LLM 호출: 54
- 소요 시간: 4m 12s

## 1. 프론트매터 (12건)
- [ ] `10_Project/Retriever.md` — summary 누락 → "..." 제안
      → patches/001-frontmatter-Retriever.diff
- [ ] `30_Area/Obsidian.md` — tags 문자열 → 배열 변환 (auto-apply 가능)
      → patches/002-fm-tags-Obsidian.diff
...

## 2. 허브 노트 추천 (3건)
- [ ] `00_Hub/AI.md` 에 하위 8개 노트 MOC 추가
      → patches/010-hub-AI.diff

## 3. 단어 연결 (21건)
- [ ] `Daily/2026-04-23.md` 에서 "RAG" → [[RAG]] 로 연결 제안 (신뢰도 0.87)
...

## 4. 태그 병합 (4건)
- [ ] `#AI` / `#ai` / `#인공지능` → `#ai` 로 통일 (영향 노트 41개)
      → patches/020-tag-merge-ai.diff
```

### 6.2 개별 diff
표준 unified diff. `rtv_apply` 가 이미 처리 가능한 포맷.

---

## 7. 새벽 배치 실행

### 7.1 엔트리
`scripts/vault-lint.mjs`
- 플래그: `--ollama`, `--dry-run`, `--only <rule>`, `--since <date>`
- 동시성: 임베딩은 병렬(기본 4), 요약은 순차(Ollama 컨텍스트 보호).

### 7.2 스케줄러 — macOS (launchd)
`~/Library/LaunchAgents/com.retriever.vault-lint.plist`
- `StartCalendarInterval`: Hour 3, Minute 0
- `StandardOutPath` / `StandardErrorPath` 를 `runs/<date>/` 로.

### 7.3 스케줄러 — Windows (Task Scheduler)
- Trigger: Daily 03:00
- Action: `node C:\...\retriever\scripts\vault-lint.mjs --ollama`

### 7.4 실패 처리
- 배치 중단 시 `runs/<date>/FAILED` 마커 + 스택 저장.
- 다음 날 재시도는 실패 커밋 시점부터 이어받기 (`last_linted` 기준).

---

## 8. 설정 (`config.yaml` 예시)

```yaml
vault_root: C:/MyArchive/MyArchive/Obsidian
ignore:
  - .trash/**
  - 91_Retriever-Store/**
  - Templates/**
rules:
  fm/required:      { enabled: true,  severity: error }
  fm/tags-array:    { enabled: true,  auto_apply: true }
  link/broken:      { enabled: true }
  note/orphan:      { enabled: true,  severity: info }
  tag/case-variant: { enabled: true,  auto_apply: false }
llm:
  provider: ollama
  endpoint: http://localhost:11434
  summary_model: gemma3:4b
  embed_model: nomic-embed-text
  max_calls_per_run: 300
  temperature: 0.2
linking:
  top_k: 5
  min_similarity: 0.78
hub:
  min_cluster_size: 4
  max_members: 12
auto_apply:
  enabled: false           # 마스터 스위치. false 면 어떤 규칙도 자동수정 안함.
```

---

## 9. 피드백 루프

`feedback.jsonl` 한 줄 예:
```json
{"run":"2026-04-24","ruleId":"link/suggest","path":"Daily/2026-04-23.md",
 "proposal":"RAG","decision":"rejected","ts":"2026-04-24T08:40:11Z"}
```

- `rtv_apply` 가 승인/거절 시점에 자동 기록.
- 다음 배치에서 같은 (노트, 제안) 쌍은 **N일간 억제**(기본 30일).
- 충분히 쌓이면 임계값(`min_similarity`) 자동 튜닝.

---

## 10. 마일스톤

| 단계 | 내용 | 완료 기준 |
|------|------|-----------|
| **M1** | Scanner + index.sqlite + 결정적 규칙 6개 | `proposals.md` 에 위반 목록이 뜨고 수동 적용 가능 |
| **M2** | Ollama 요약 + `summary` auto-apply (옵션) | 변경 노트에 한 줄 요약 주입 |
| **M3** | 임베딩 + 단어 연결 + 허브 추천 | top-K 제안, 승인 시 MOC 블록 삽입 |
| **M4** | 태그 정규화 + 피드백 루프 | 억제 로직, 임계값 자동 조정 |
| **M5** | launchd/Task Scheduler 통합 + 운영 문서 | 새벽 무인 실행, 실패 복구 검증 |

---

## 11. 열린 질문

1. 볼트 루트가 **Obsidian Sync** 로 다중 기기 동기화 중인데, 린터는 Mac Studio 한 곳에서만 돌리는 것으로 충분한가? (충돌 최소화 위해 Yes 권장)
2. `summary` 한 줄 요약의 언어는 본문 언어 따라가기? 아니면 항상 한국어?
3. 허브 노트 생성 시 **새 파일을 만들 권한**을 줄지, 아니면 기존 허브에 블록만 덧붙이게 할지.
4. Daily Note 처럼 고의로 고아인 노트 유형은 어떻게 제외 태깅할지 (`note/orphan` 화이트리스트).
