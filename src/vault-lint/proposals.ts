import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RunStats, Violation } from "./types.js";

export interface ProposalReport {
  date: string;
  stats: RunStats;
  violations: Violation[];
}

export function renderProposals(report: ProposalReport): string {
  const lines: string[] = [];
  lines.push(`# Vault Lint Proposals — ${report.date}`);
  lines.push("");
  lines.push(
    `- 스캔 노트: ${report.stats.scanned} / 변경 감지: ${report.stats.changed}`
  );
  lines.push(
    `- 위반: ${report.stats.violations} / 소요 시간: ${formatDuration(report.stats.durationMs)}`
  );
  lines.push("");

  const grouped = groupByRule(report.violations);
  if (grouped.size === 0) {
    lines.push("위반 사항 없음.");
    lines.push("");
    return lines.join("\n");
  }

  let section = 1;
  for (const [ruleId, items] of grouped) {
    lines.push(`## ${section}. ${ruleId} (${items.length}건)`);
    section++;
    for (const v of items) {
      const severity = severityIcon(v.severity);
      lines.push(`- ${severity} \`${v.path}\` — ${v.message}`);
      if (v.autoApplyEligible) {
        lines.push(`  - auto-apply 후보 (config 의 \`auto_apply\` 활성화 시)`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeProposals(
  outDir: string,
  report: ProposalReport
): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, "proposals.md");
  await fs.writeFile(filePath, renderProposals(report), "utf-8");

  const statsPath = path.join(outDir, "stats.json");
  await fs.writeFile(
    statsPath,
    JSON.stringify(
      {
        date: report.date,
        ...report.stats,
        violations_by_rule: countByRule(report.violations),
      },
      null,
      2
    ),
    "utf-8"
  );
  return filePath;
}

function groupByRule(violations: Violation[]): Map<string, Violation[]> {
  const map = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = map.get(v.ruleId) ?? [];
    list.push(v);
    map.set(v.ruleId, list);
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function countByRule(violations: Violation[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of violations) {
    out[v.ruleId] = (out[v.ruleId] ?? 0) + 1;
  }
  return out;
}

function severityIcon(s: string): string {
  if (s === "error") return "[ERROR]";
  if (s === "warn") return "[WARN]";
  return "[INFO]";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}
