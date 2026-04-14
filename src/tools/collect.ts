import type { RtvConfig } from "../types.js";
import { Collector } from "../core/collector.js";

interface CollectParams {
  project: string;
  path: string;
}

export async function handleCollect(params: CollectParams, config: RtvConfig) {
  const collector = new Collector(config);
  const snapshot = await collector.collect(params.project, params.path);
  return {
    success: true,
    message: `"${params.project}" 스냅샷 수집 완료`,
    snapshot,
  };
}
