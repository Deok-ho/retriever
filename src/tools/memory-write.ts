import type { RtvConfig, MemoryType } from "../types.js";
import { MemoryManager } from "../core/memory-manager.js";

interface MemoryWriteParams {
  project: string;
  name: string;
  type: MemoryType;
  content: string;
  description?: string;
}

export async function handleMemoryWrite(params: MemoryWriteParams, config: RtvConfig) {
  const mgr = new MemoryManager(config);

  // Check if it's an update
  const existing = await mgr.read(params.project, params.name);
  const action = existing?.source === "project" ? "수정" : "생성";

  await mgr.write(params.project, {
    name: params.name,
    description: params.description ?? params.name,
    type: params.type,
    body: params.content,
  });

  return {
    success: true,
    message: `메모리 "${params.name}" ${action} 완료 (type: ${params.type})`,
  };
}
