#!/usr/bin/env node
/**
 * Vault Linter — Obsidian 볼트의 결정적/AI 린터
 *
 * 실행:
 *   node scripts/vault-lint.mjs --vault <path> [--config <path>] [--dry-run] [--only <ruleId,...>]
 *
 * 환경변수:
 *   RTV_VAULT_ROOT        볼트 루트 (--vault 미지정 시)
 *   RTV_VAULT_CONFIG      config.yaml 경로
 */
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const distEntry = path.resolve(__dirname, "..", "dist", "vault-lint", "index.js");

let mod;
try {
  mod = await import(url.pathToFileURL(distEntry).href);
} catch (err) {
  console.error(
    `[vault-lint] dist 빌드를 찾지 못했습니다. 먼저 'npm run build' 를 실행하세요.\n` +
      `  expected: ${distEntry}\n  reason: ${err?.message ?? err}`
  );
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const vaultRoot = args.vault ?? process.env.RTV_VAULT_ROOT;
if (!vaultRoot) {
  console.error("[vault-lint] --vault 또는 RTV_VAULT_ROOT 가 필요합니다");
  process.exit(2);
}

const configPath =
  args.config ??
  process.env.RTV_VAULT_CONFIG ??
  path.join(vaultRoot, "91_Retriever-Store", "vault-lint", "config.yaml");

const config = await mod.loadVaultLintConfig(configPath, { vaultRoot });

const result = await mod.runVaultLint({
  config,
  dryRun: Boolean(args["dry-run"]),
  only: args.only ? String(args.only).split(",").map((s) => s.trim()) : undefined,
});

const { stats, proposalsPath } = result;
console.log(
  `[vault-lint] scanned=${stats.scanned} changed=${stats.changed} ` +
    `violations=${stats.violations} duration=${stats.durationMs}ms`
);
if (proposalsPath) console.log(`[vault-lint] proposals: ${proposalsPath}`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/vault-lint.mjs [options]

Options:
  --vault <path>      Obsidian 볼트 루트 (기본: $RTV_VAULT_ROOT)
  --config <path>     config.yaml 경로
  --dry-run           proposals.md 작성 안 함
  --only <ids>        쉼표로 구분된 ruleId 목록만 실행
  -h, --help          도움말
`);
}
