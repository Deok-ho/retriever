export { parseNote } from "./parser.js";
export { scanVault, compileGlob } from "./scanner.js";
export { IndexDB } from "./db.js";
export { ALL_RULES, runRules, buildResolver } from "./rules.js";
export { renderProposals, writeProposals } from "./proposals.js";
export { runVaultLint } from "./runner.js";
export { loadVaultLintConfig } from "./config.js";
export type {
  Note,
  WikiLink,
  Violation,
  Rule,
  RuleContext,
  Severity,
  VaultLintConfig,
  RunStats,
} from "./types.js";
