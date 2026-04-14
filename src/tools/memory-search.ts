import type { RtvConfig } from "../types.js";
import { MemoryManager } from "../core/memory-manager.js";

interface MemorySearchParams {
  project: string;
  query: string;
}

export async function handleMemorySearch(params: MemorySearchParams, config: RtvConfig) {
  const mgr = new MemoryManager(config);
  const results = await mgr.search(params.project, params.query);

  if (results.length === 0) {
    return { success: true, message: `"${params.query}" 검색 결과 없음`, results: [] };
  }

  const lines = results.map(
    (e) => `[${e.source}] ${e.name} (${e.type}) — ${e.description}`
  );
  return {
    success: true,
    message: `${results.length}개 결과:\n${lines.join("\n")}`,
    results,
  };
}
