import type { RtvConfig } from "../types.js";
import { MemoryManager } from "../core/memory-manager.js";

interface MemoryReadParams {
  project: string;
  name: string;
}

export async function handleMemoryRead(params: MemoryReadParams, config: RtvConfig) {
  const mgr = new MemoryManager(config);
  const entry = await mgr.read(params.project, params.name);

  if (!entry) {
    return { success: false, message: `"${params.name}" 메모리를 찾을 수 없습니다` };
  }

  const lines = [
    `[${entry.source}] ${entry.name} (type: ${entry.type})`,
    entry.description,
    "─".repeat(40),
    entry.body,
  ];
  return { success: true, message: lines.join("\n"), entry };
}
