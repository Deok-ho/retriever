import type {
  RtvConfig,
  Manifest,
  GlobalSettings,
  Snapshot,
  DiffItem,
  DiffReport,
} from "../types.js";
import { paths } from "../config.js";
import { readYaml } from "../utils/yaml.js";

export class Differ {
  private config: RtvConfig;

  constructor(config: RtvConfig) {
    this.config = config;
  }

  async diff(projectName: string): Promise<DiffReport> {
    const p = paths(this.config);
    const manifest = await readYaml<Manifest>(p.manifest(projectName));
    const globalSettings = await readYaml<GlobalSettings>(p.global.settings);
    const snapshot = await readYaml<Snapshot>(p.snapshot(projectName));

    if (!snapshot) {
      return {
        project: projectName,
        device: this.config.deviceName,
        collected_at: "",
        items: [
          {
            scope: "snapshot",
            status: "missing",
            message: "스냅샷 없음 — rtv collect를 먼저 실행하세요",
          },
        ],
        summary: { match: 0, mismatch: 0, missing: 1 },
      };
    }

    const items: DiffItem[] = [];

    // Persona diff
    if (snapshot.persona.match) {
      items.push({
        scope: "persona",
        status: "match",
        desired: snapshot.persona.desired,
        actual: snapshot.persona.current,
        message: `persona: ${snapshot.persona.desired}`,
      });
    } else {
      items.push({
        scope: "persona",
        status: "mismatch",
        desired: snapshot.persona.desired,
        actual: snapshot.persona.current,
        message: `persona: ${snapshot.persona.current} → ${snapshot.persona.desired}`,
      });
    }

    // Env diff
    const allEnv = { ...globalSettings?.env, ...manifest?.env };
    for (const [key, decl] of Object.entries(allEnv)) {
      const actual = snapshot.env[key];
      if (actual === "set") {
        items.push({
          scope: "env",
          status: "match",
          message: `${key}: set`,
        });
      } else if (decl.required) {
        items.push({
          scope: "env",
          status: "missing",
          message: `${key} 누락 (required, source: ${decl.source})`,
        });
      } else {
        items.push({
          scope: "env",
          status: "missing",
          message: `${key} 누락 (optional, source: ${decl.source})`,
        });
      }
    }

    // Repo diff
    if (snapshot.repo.dirty) {
      items.push({
        scope: "repo",
        status: "mismatch",
        message: `uncommitted changes: ${snapshot.repo.uncommitted_files} files`,
      });
    }
    if (snapshot.repo.remote_sync && snapshot.repo.remote_sync !== "up to date") {
      items.push({
        scope: "repo",
        status: "mismatch",
        message: `remote: ${snapshot.repo.remote_sync}`,
      });
    }

    // Harness diff — per adapter
    if (manifest?.harness) {
      for (const [tool, _config] of Object.entries(manifest.harness)) {
        const actual = snapshot.harness[tool];
        if (!actual) {
          items.push({
            scope: `harness:${tool}`,
            status: "missing",
            message: `${tool}: 감지되지 않음`,
          });
        } else {
          items.push({
            scope: `harness:${tool}`,
            status: "match",
            message: `${tool}: rules=${actual.rules_count ?? 0}, memory=${actual.memory_count ?? 0}`,
          });
        }
      }
    }

    const summary = {
      match: items.filter((i) => i.status === "match").length,
      mismatch: items.filter((i) => i.status === "mismatch").length,
      missing: items.filter((i) => i.status === "missing").length,
    };

    return {
      project: projectName,
      device: this.config.deviceName,
      collected_at: snapshot.collected_at,
      items,
      summary,
    };
  }

  formatReport(report: DiffReport): string {
    const lines: string[] = [];
    const date = report.collected_at
      ? new Date(report.collected_at).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })
      : "N/A";

    lines.push(`[${report.project}] ${report.device}  ${date}`);
    lines.push("─".repeat(45));

    for (const item of report.items) {
      const icon =
        item.status === "match"
          ? "✓"
          : item.status === "mismatch"
            ? "⚠"
            : "✗";
      lines.push(`${icon} ${item.message}`);
    }

    lines.push("─".repeat(45));

    if (report.summary.mismatch > 0 || report.summary.missing > 0) {
      lines.push("rtv apply로 반영하시겠습니까?");
    } else {
      lines.push("모든 항목이 동기화되어 있습니다.");
    }

    return lines.join("\n");
  }
}
