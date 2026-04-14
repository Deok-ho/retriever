---
name: rtv
description: "Retriever — 프로젝트 하네스 동기화. /rtv status로 상태 확인, /rtv apply로 반영, /rtv init으로 등록."
---

# Retriever (/rtv)

Cross-LLM 하네스 동기화 도구. MCP 서버의 도구를 호출합니다.

## 사용법

### `/rtv status`
현재 프로젝트의 desired vs actual 리포트를 출력합니다.
→ `rtv_status` MCP 도구 호출 (project: 현재 프로젝트명, path: 현재 작업 디렉토리)

### `/rtv apply`
리포트의 diff를 로컬에 반영합니다.
→ `rtv_apply` MCP 도구 호출 (project: 현재 프로젝트명, path: 현재 작업 디렉토리)

### `/rtv init`
현재 디렉토리를 Retriever 프로젝트로 등록합니다.
→ `rtv_init` MCP 도구 호출, 프로젝트명과 페르소나를 사용자에게 질문

### `/rtv diff [scope]`
특정 항목(persona, env, repo, harness)의 상세 diff를 출력합니다.
→ `rtv_diff` MCP 도구 호출

### `/rtv projects`
등록된 전체 프로젝트 목록을 출력합니다.
→ `rtv_projects` MCP 도구 호출

## 세션 시작 루틴

1. `/rtv status` 실행
2. diff 리포트 확인
3. 필요시 `/rtv apply` 실행
4. 작업 시작
