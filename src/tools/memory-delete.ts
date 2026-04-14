import type { RtvConfig } from "../types.js";
import { MemoryManager } from "../core/memory-manager.js";

interface MemoryDeleteParams {
  project: string;
  name: string;
}

export async function handleMemoryDelete(params: MemoryDeleteParams, config: RtvConfig) {
  const mgr = new MemoryManager(config);
  const result = await mgr.delete(params.project, params.name);

  if (result) {
    return { success: true, message: `메모리 "${params.name}" 삭제 완료` };
  }

  // Check if it's a global memory
  const entry = await mgr.read(params.project, params.name);
  if (entry?.source === "global") {
    return {
      success: false,
      message: `"${params.name}"은 글로벌 메모리입니다. 프로젝트 메모리만 삭제할 수 있습니다.`,
    };
  }

  return {
    success: false,
    message: `"${params.name}" 메모리를 찾을 수 없습니다`,
  };
}
