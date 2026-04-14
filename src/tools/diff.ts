import type { RtvConfig } from "../types.js";
import { Differ } from "../core/differ.js";

interface DiffParams {
  project: string;
  scope?: "persona" | "env" | "repo" | "harness";
}

export async function handleDiff(params: DiffParams, config: RtvConfig) {
  const differ = new Differ(config);
  const report = await differ.diff(params.project);

  if (params.scope) {
    report.items = report.items.filter(
      (item) =>
        item.scope === params.scope ||
        item.scope.startsWith(`${params.scope}:`)
    );
  }

  const formatted = differ.formatReport(report);
  return { success: true, report, formatted };
}
