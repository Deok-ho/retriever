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

const config = loadConfig();

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
