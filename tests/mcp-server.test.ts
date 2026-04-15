import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTestStore,
  seedStore,
  type TestStore,
} from "./fixtures/setup.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function getTextContent(
  result: Awaited<ReturnType<Client["callTool"]>>
): string {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

describe("retriever MCP server", () => {
  let store: TestStore;
  let client: Client;
  let transport: StdioClientTransport;
  let tmpProject: string;

  beforeAll(async () => {
    store = createTestStore();
    await seedStore(store);

    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-mcp-"));
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# MCP Test Rules\n");

    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    execFileSync(npmCmd, ["run", "build"], {
      cwd: repoRoot,
      stdio: "ignore",
    });

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(repoRoot, "dist", "index.js")],
      cwd: repoRoot,
      env: {
        ...process.env,
        RTV_STORE_PATH: store.storePath,
        RTV_DEVICE_NAME: store.deviceName,
      } as Record<string, string>,
      stderr: "pipe",
    });

    client = new Client({
      name: "retriever-integration-test",
      version: "1.0.0",
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    await transport?.close();
    fs.rmSync(tmpProject, { recursive: true, force: true });
    store?.cleanup();
  });

  it("registers Retriever tools over stdio", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);

    expect(names).toContain("rtv_init");
    expect(names).toContain("rtv_status");
    expect(names).toContain("rtv_apply");
    expect(names).toContain("rtv_projects");
    expect(names).toContain("rtv_memory_list");
  });

  it("supports init -> projects -> status flow", async () => {
    const initResult = await client.callTool({
      name: "rtv_init",
      arguments: {
        name: "mcp-project",
        path: tmpProject,
        persona: "company",
      },
    });
    expect(getTextContent(initResult)).toContain("등록 완료");

    const projectsResult = await client.callTool({
      name: "rtv_projects",
      arguments: {},
    });
    expect(getTextContent(projectsResult)).toContain("mcp-project");

    const statusResult = await client.callTool({
      name: "rtv_status",
      arguments: {
        project: "mcp-project",
        path: tmpProject,
      },
    });
    const statusText = getTextContent(statusResult);
    expect(statusText).toContain("[mcp-project]");
    expect(statusText).toContain("TEST-PC");
  });
});
