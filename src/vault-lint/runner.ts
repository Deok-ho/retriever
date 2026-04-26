import * as path from "node:path";
import { scanVault } from "./scanner.js";
import { IndexDB } from "./db.js";
import { runRules } from "./rules.js";
import { writeProposals } from "./proposals.js";
import type {
  RunStats,
  Severity,
  VaultLintConfig,
  Violation,
} from "./types.js";

export interface RunOptions {
  config: VaultLintConfig;
  /** ISO date string (YYYY-MM-DD), defaults to today. */
  date?: string;
  /** When set, only these rule ids run. */
  only?: string[];
  /** When true, skip writing proposals to disk. */
  dryRun?: boolean;
}

export interface RunResult {
  stats: RunStats;
  violations: Violation[];
  proposalsPath: string | null;
}

export async function runVaultLint(opts: RunOptions): Promise<RunResult> {
  const start = Date.now();
  const { config } = opts;

  const { notes, errors } = await scanVault({
    vaultRoot: config.vaultRoot,
    ignore: config.ignore,
  });

  const dbPath = path.join(config.storePath, "index.sqlite");
  const db = new IndexDB(dbPath);
  let changedCount: number;
  try {
    const diff = db.diff(notes);
    changedCount = diff.added.length + diff.changed.length;
    db.upsertAll(notes);
    if (diff.removed.length > 0) db.removePaths(diff.removed);
  } finally {
    db.close();
  }

  const enabled = computeEnabledSet(config, opts.only);
  const overrides = computeSeverityOverrides(config);
  const violations = runRules(notes, enabled, overrides);

  const stats: RunStats = {
    scanned: notes.length,
    changed: changedCount,
    violations: violations.length,
    durationMs: Date.now() - start,
  };

  let proposalsPath: string | null = null;
  if (!opts.dryRun) {
    const date = opts.date ?? today();
    const outDir = path.join(config.storePath, "runs", date);
    proposalsPath = await writeProposals(outDir, {
      date,
      stats,
      violations,
    });
  }

  if (errors.length > 0) {
    process.stderr.write(
      `[vault-lint] ${errors.length} files failed to read\n`
    );
  }

  return { stats, violations, proposalsPath };
}

function computeEnabledSet(
  config: VaultLintConfig,
  only?: string[]
): Set<string> {
  if (only && only.length > 0) return new Set(only);
  const out = new Set<string>();
  for (const [id, cfg] of Object.entries(config.rules)) {
    if (cfg.enabled) out.add(id);
  }
  return out;
}

function computeSeverityOverrides(
  config: VaultLintConfig
): Map<string, Severity> {
  const map = new Map<string, Severity>();
  for (const [id, cfg] of Object.entries(config.rules)) {
    if (cfg.severity) map.set(id, cfg.severity);
  }
  return map;
}

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
