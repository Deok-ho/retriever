import type { RtvConfig } from "../types.js";
import { Projector } from "../core/projector.js";

interface ApplyParams {
  project: string;
  path: string;
  scope?: "rules" | "persona" | "all";
  dry_run?: boolean;
}

export async function handleApply(params: ApplyParams, config: RtvConfig) {
  const projector = new Projector(config);
  const scope = params.scope ?? "all";

  if (params.dry_run) {
    return {
      success: true,
      message: `dry run — "${params.project}" ${scope} 항목이 반영될 예정입니다`,
      dry_run: true,
    };
  }

  if (scope === "rules") {
    const rules = await projector.applyRules(params.project, params.path);
    return { success: true, message: `rules 반영 완료: ${rules.join(", ")}` };
  }

  if (scope === "persona") {
    const result = await projector.applyPersona(params.project, params.path);
    return { success: true, message: result };
  }

  // all
  const result = await projector.applyAll(params.project, params.path);
  return {
    success: true,
    message: `반영 완료\n  rules: ${result.rules.join(", ")}\n  ${result.persona}`,
  };
}
