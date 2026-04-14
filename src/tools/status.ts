import type { RtvConfig } from "../types.js";
import { Collector } from "../core/collector.js";
import { Differ } from "../core/differ.js";

interface StatusParams {
  project: string;
  path: string;
}

export async function handleStatus(params: StatusParams, config: RtvConfig) {
  // Auto-collect before status
  const collector = new Collector(config);
  await collector.collect(params.project, params.path);

  const differ = new Differ(config);
  const report = await differ.diff(params.project);
  const formatted = differ.formatReport(report);

  return { success: true, report, formatted };
}
