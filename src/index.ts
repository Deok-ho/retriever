#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { handleInit } from "./tools/init.js";
import { handleCollect } from "./tools/collect.js";
import { handleStatus } from "./tools/status.js";
import { handleDiff } from "./tools/diff.js";
import { handleApply } from "./tools/apply.js";
import { handleProjects } from "./tools/projects.js";
import { handleMemoryList } from "./tools/memory-list.js";
import { handleMemorySearch } from "./tools/memory-search.js";
import { handleMemoryRead } from "./tools/memory-read.js";
import { handleMemoryWrite } from "./tools/memory-write.js";
import { handleMemoryDelete } from "./tools/memory-delete.js";
import { HubService } from "./hub/service.js";
import * as hubTools from "./hub/tools.js";

const config = loadConfig();
const hub = new HubService();

const server = new McpServer({
  name: "retriever",
  version: "0.1.0",
});

server.tool(
  "rtv_init",
  "프로젝트를 Retriever에 등록하고 manifest를 생성합니다",
  {
    name: z.string().describe("프로젝트 이름"),
    path: z.string().describe("프로젝트 로컬 경로"),
    persona: z.string().describe("사용할 페르소나 (예: personal, company)"),
    description: z.string().optional().describe("프로젝트 설명"),
  },
  async ({ name, path, persona, description }) => {
    const result = await handleInit({ name, path, persona, description }, config);
    return {
      content: [{ type: "text" as const, text: result.message }],
      isError: !result.success,
    };
  }
);

server.tool(
  "rtv_collect",
  "현재 로컬 상태를 스냅샷으로 수집합니다",
  {
    project: z.string().describe("프로젝트 이름"),
    path: z.string().describe("프로젝트 로컬 경로"),
  },
  async ({ project, path }) => {
    const result = await handleCollect({ project, path }, config);
    return {
      content: [{ type: "text" as const, text: result.message }],
    };
  }
);

server.tool(
  "rtv_status",
  "desired vs actual 전체 리포트를 출력합니다 (자동 collect 포함)",
  {
    project: z.string().describe("프로젝트 이름"),
    path: z.string().describe("프로젝트 로컬 경로"),
  },
  async ({ project, path }) => {
    const result = await handleStatus({ project, path }, config);
    return {
      content: [{ type: "text" as const, text: result.formatted }],
    };
  }
);

server.tool(
  "rtv_diff",
  "특정 항목에 대한 상세 diff를 출력합니다",
  {
    project: z.string().describe("프로젝트 이름"),
    scope: z
      .enum(["persona", "env", "repo", "harness"])
      .optional()
      .describe("diff 범위 (미지정 시 전체)"),
  },
  async ({ project, scope }) => {
    const result = await handleDiff({ project, scope }, config);
    return {
      content: [{ type: "text" as const, text: result.formatted }],
    };
  }
);

server.tool(
  "rtv_apply",
  "승인된 diff를 로컬에 반영합니다",
  {
    project: z.string().describe("프로젝트 이름"),
    path: z.string().describe("프로젝트 로컬 경로"),
    scope: z
      .enum(["rules", "persona", "all"])
      .optional()
      .describe("반영 범위 (기본: all)"),
    dry_run: z.boolean().optional().describe("미리보기만 (기본: false)"),
  },
  async ({ project, path, scope, dry_run }) => {
    const result = await handleApply({ project, path, scope, dry_run }, config);
    return {
      content: [{ type: "text" as const, text: result.message }],
    };
  }
);

server.tool(
  "rtv_projects",
  "등록된 전체 프로젝트 목록을 출력합니다",
  {},
  async () => {
    const projects = await handleProjects(config);
    if (projects.length === 0) {
      return {
        content: [
          { type: "text" as const, text: "등록된 프로젝트가 없습니다. rtv init으로 등록하세요." },
        ],
      };
    }
    const lines = projects.map(
      (p) =>
        `${p.name} (${p.persona}) ${p.hasSnapshot ? `— 마지막 수집: ${p.lastCollected}` : "— 미수집"}`
    );
    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  }
);

// === Memory Hub ===

server.tool(
  "rtv_memory_list",
  "프로젝트 메모리 목록을 출력합니다 (글로벌 + 프로젝트 병합)",
  {
    project: z.string().describe("프로젝트 이름"),
    type: z
      .enum(["user", "feedback", "project", "reference"])
      .optional()
      .describe("메모리 타입 필터"),
  },
  async ({ project, type }) => {
    const result = await handleMemoryList({ project, type }, config);
    return { content: [{ type: "text" as const, text: result.message }] };
  }
);

server.tool(
  "rtv_memory_search",
  "키워드로 메모리를 검색합니다",
  {
    project: z.string().describe("프로젝트 이름"),
    query: z.string().describe("검색 키워드"),
  },
  async ({ project, query }) => {
    const result = await handleMemorySearch({ project, query }, config);
    return { content: [{ type: "text" as const, text: result.message }] };
  }
);

server.tool(
  "rtv_memory_read",
  "특정 메모리의 상세 내용을 읽습니다",
  {
    project: z.string().describe("프로젝트 이름"),
    name: z.string().describe("메모리 이름"),
  },
  async ({ project, name }) => {
    const result = await handleMemoryRead({ project, name }, config);
    return {
      content: [{ type: "text" as const, text: result.message }],
      isError: !result.success,
    };
  }
);

server.tool(
  "rtv_memory_write",
  "메모리를 생성하거나 수정합니다 (프로젝트 메모리에 저장)",
  {
    project: z.string().describe("프로젝트 이름"),
    name: z.string().describe("메모리 이름"),
    type: z.enum(["user", "feedback", "project", "reference"]).describe("메모리 타입"),
    content: z.string().describe("메모리 본문"),
    description: z.string().optional().describe("메모리 설명 (한 줄)"),
  },
  async ({ project, name, type, content, description }) => {
    const result = await handleMemoryWrite(
      { project, name, type, content, description },
      config
    );
    return { content: [{ type: "text" as const, text: result.message }] };
  }
);

server.tool(
  "rtv_memory_delete",
  "프로젝트 메모리를 삭제합니다 (글로벌 메모리는 삭제 불가)",
  {
    project: z.string().describe("프로젝트 이름"),
    name: z.string().describe("메모리 이름"),
  },
  async ({ project, name }) => {
    const result = await handleMemoryDelete({ project, name }, config);
    return {
      content: [{ type: "text" as const, text: result.message }],
      isError: !result.success,
    };
  }
);

// === Hub (v3 MVP): SQLite 기반 티켓팅 ===

server.tool(
  "rtv_list_projects",
  "프로젝트 목록을 출력합니다 (SQLite hub)",
  {},
  async () => ({ content: [{ type: "text" as const, text: hubTools.listProjects(hub) }] })
);

server.tool(
  "rtv_upsert_project",
  "프로젝트를 생성 또는 갱신합니다",
  {
    project_id: z.string().describe("프로젝트 ID (snake_case)"),
    status: z.enum(["active", "paused", "done", "archived"]).optional(),
    health: z.enum(["green", "yellow", "red"]).optional(),
    priority: z.enum(["high", "med", "low"]).optional(),
    phase: z.string().nullable().optional(),
    repo_path: z.string().nullable().optional(),
    harness_project: z.string().nullable().optional(),
    purpose: z.string().nullable().optional().describe("장기 방향 (목적)"),
    goal: z.string().nullable().optional().describe("단기 실행 (목표)"),
    context_budget: z.number().int().optional(),
    next_task_id: z.string().nullable().optional(),
  },
  async (input) => ({
    content: [{ type: "text" as const, text: hubTools.upsertProject(hub, input) }],
  })
);

server.tool(
  "rtv_create_ticket",
  "티켓을 생성합니다 (프로젝트가 없으면 자동 생성)",
  {
    project_id: z.string(),
    task_id: z.string().describe("snake_case 고유 ID"),
    summary: z.string().describe("한 줄 요약"),
    status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
    priority: z.enum(["high", "med", "low"]).optional(),
    task_type: z.enum(["구현", "리서치", "문서", "리뷰"]).nullable().optional(),
    body: z.string().optional(),
    estimated_hours: z.number().nullable().optional(),
    completion_criteria: z.array(z.string()).optional(),
    context_refs: z.array(z.string()).optional().describe("wikilink 배열"),
    intake_source: z.enum(["manual", "gemma4", "mcp", "import"]).optional(),
  },
  async (input) => ({
    content: [{ type: "text" as const, text: hubTools.createTicket(hub, input) }],
  })
);

server.tool(
  "rtv_list_tickets",
  "티켓 목록을 필터링해서 출력합니다",
  {
    project_id: z.string().optional(),
    status: z
      .union([
        z.enum(["todo", "in_progress", "review", "done", "blocked"]),
        z.array(z.enum(["todo", "in_progress", "review", "done", "blocked"])),
      ])
      .optional(),
    priority: z.enum(["high", "med", "low"]).optional(),
    limit: z.number().int().optional(),
  },
  async (filter) => ({
    content: [{ type: "text" as const, text: hubTools.listTickets(hub, filter) }],
  })
);

server.tool(
  "rtv_read_ticket",
  "티켓 상세(본문/기준/첨부/refs)를 출력합니다",
  {
    project_id: z.string(),
    task_id: z.string(),
  },
  async ({ project_id, task_id }) => ({
    content: [
      {
        type: "text" as const,
        text: hubTools.readTicket(hub, project_id, task_id),
      },
    ],
  })
);

server.tool(
  "rtv_update_ticket",
  "티켓 필드를 부분 갱신합니다",
  {
    project_id: z.string(),
    task_id: z.string(),
    status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
    priority: z.enum(["high", "med", "low"]).optional(),
    body: z.string().optional(),
    actual_hours: z.number().nullable().optional(),
    learnings: z.string().nullable().optional(),
  },
  async ({ project_id, task_id, ...patch }) => ({
    content: [
      {
        type: "text" as const,
        text: hubTools.updateTicket(hub, project_id, task_id, patch),
      },
    ],
  })
);

server.tool(
  "rtv_complete_ticket",
  "criteria 충족 여부 확인 후 티켓을 done으로 승격합니다",
  {
    project_id: z.string(),
    task_id: z.string(),
    learnings: z.string().nullable().optional(),
  },
  async ({ project_id, task_id, learnings }) => ({
    content: [
      {
        type: "text" as const,
        text: hubTools.completeTicket(hub, project_id, task_id, learnings ?? null),
      },
    ],
  })
);

server.tool(
  "rtv_attach",
  "티켓에 첨부를 추가합니다 (파일 또는 URL)",
  {
    project_id: z.string(),
    task_id: z.string(),
    kind: z.enum(["file", "url"]),
    source_path: z.string().optional().describe("kind=file 시 원본 파일 경로 (복사됨)"),
    type: z
      .enum(["session", "diff", "research", "transcript"])
      .optional()
      .describe("kind=file 시 필수"),
    url: z.string().optional().describe("kind=url 시 필수"),
    note: z.string().optional().describe("kind=url 시 메모"),
  },
  async (input) => {
    if (input.kind === "file") {
      if (!input.source_path || !input.type) {
        return {
          content: [
            { type: "text" as const, text: "kind=file: source_path, type 필수" },
          ],
          isError: true,
        };
      }
      const text = await hubTools.attach(hub, {
        kind: "file",
        project_id: input.project_id,
        task_id: input.task_id,
        source_path: input.source_path,
        type: input.type,
      });
      return { content: [{ type: "text" as const, text }] };
    }
    if (!input.url) {
      return {
        content: [{ type: "text" as const, text: "kind=url: url 필수" }],
        isError: true,
      };
    }
    const text = await hubTools.attach(hub, {
      kind: "url",
      project_id: input.project_id,
      task_id: input.task_id,
      url: input.url,
      note: input.note,
    });
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "rtv_detach",
  "첨부를 제거합니다 (파일도 삭제)",
  {
    attachment_id: z.string(),
  },
  async ({ attachment_id }) => ({
    content: [
      { type: "text" as const, text: await hubTools.detach(hub, attachment_id) },
    ],
  })
);

server.tool(
  "rtv_classify_ticket",
  "자연어 요청을 Gemma4로 분류하여 티켓 초안을 제안합니다",
  {
    request: z.string().describe("자연어 요청"),
    project_hint: z.string().optional().describe("프로젝트 힌트"),
  },
  async ({ request, project_hint }) => ({
    content: [
      {
        type: "text" as const,
        text: await hubTools.classifyTicket(hub, request, project_hint),
      },
    ],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
