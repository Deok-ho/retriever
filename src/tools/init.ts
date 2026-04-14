import * as fs from "node:fs/promises";
import type { RtvConfig, Manifest, HarnessConfig } from "../types.js";
import { paths } from "../config.js";
import { writeYaml } from "../utils/yaml.js";
import { ClaudeCodeAdapter } from "../adapters/claude-code.js";
import { CodexAdapter } from "../adapters/codex.js";
import type { ToolAdapter } from "../adapters/base.js";

interface InitParams {
  name: string;
  path: string;
  persona: string;
  description?: string;
}

interface InitResult {
  success: boolean;
  message: string;
}

export async function handleInit(
  params: InitParams,
  config: RtvConfig
): Promise<InitResult> {
  const p = paths(config);
  const projectDir = p.desiredState(params.name);

  // Check if project already exists
  try {
    await fs.access(projectDir);
    return {
      success: false,
      message: `"${params.name}" 프로젝트가 이미 존재합니다`,
    };
  } catch {
    // expected — doesn't exist yet
  }

  // Auto-detect harness tools
  const adapters: ToolAdapter[] = [new ClaudeCodeAdapter(), new CodexAdapter()];
  const harness: Record<string, HarnessConfig> = {};
  for (const adapter of adapters) {
    if (await adapter.detect(params.path)) {
      if (adapter.name === "codex") {
        harness[adapter.name] = { instructions: "./rules/" };
      } else {
        harness[adapter.name] = { rules: "./rules/", memory: "./memory/" };
      }
    }
  }
  // Default to claude-code if nothing detected
  if (Object.keys(harness).length === 0) {
    harness["claude-code"] = { rules: "./rules/", memory: "./memory/" };
  }

  const manifest: Manifest = {
    project: {
      name: params.name,
      description: params.description ?? "",
      created: new Date().toISOString().split("T")[0],
    },
    persona: params.persona,
    harness,
    sync: {
      sessions: true,
      conversations: true,
      tasks: true,
      plans: true,
    },
  };

  await writeYaml(p.manifest(params.name), manifest);

  // Create subdirectories
  await fs.mkdir(`${projectDir}/rules`, { recursive: true });
  await fs.mkdir(`${projectDir}/memory`, { recursive: true });

  return {
    success: true,
    message: `프로젝트 "${params.name}" 등록 완료 (persona: ${params.persona})`,
  };
}
