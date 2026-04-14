import type { RtvConfig, MemoryType } from "../types.js";
import { MemoryManager } from "../core/memory-manager.js";

interface MemoryListParams {
  project: string;
  type?: MemoryType;
}

export async function handleMemoryList(params: MemoryListParams, config: RtvConfig) {
  const mgr = new MemoryManager(config);
  const entries = await mgr.list(params.project, params.type);

  if (entries.length === 0) {
    return { success: true, message: "메모리가 없습니다.", entries: [] };
  }

  const lines = entries.map(
    (e) => `[${e.source}] ${e.name} (${e.type}) — ${e.description}`
  );
  return { success: true, message: lines.join("\n"), entries };
}
