export interface VaultLintConfig {
  vaultRoot: string;
  storePath: string;
  ignore: string[];
  rules: Record<string, RuleConfig>;
  autoApply: { enabled: boolean };
}

export interface RuleConfig {
  enabled: boolean;
  severity?: Severity;
  autoApply?: boolean;
}

export type Severity = "error" | "warn" | "info";

export interface Note {
  /** Path relative to the vault root, using forward slashes. */
  path: string;
  /** sha256 of the raw file bytes. */
  hash: string;
  /** Last modification time in epoch milliseconds. */
  mtime: number;
  /** First H1 heading or null. */
  h1: string | null;
  /** Parsed YAML frontmatter or null when missing. */
  frontmatter: Record<string, unknown> | null;
  /** Raw frontmatter block including delimiters, when present. */
  frontmatterRaw: string | null;
  /** Wikilink targets as written: e.g. "Foo", "Foo|alias", "Foo#section". */
  wikilinks: WikiLink[];
  /** Tags from frontmatter and inline (#tag). */
  tags: string[];
  /** Body without frontmatter. */
  body: string;
}

export interface WikiLink {
  target: string;
  alias: string | null;
  section: string | null;
}

export interface Violation {
  ruleId: string;
  severity: Severity;
  path: string;
  message: string;
  /** Optional unified diff to apply for fix. */
  patch?: string;
  /** Whether this rule's fix may auto-apply when enabled in config. */
  autoApplyEligible?: boolean;
}

export interface RuleContext {
  notes: Note[];
  /** Resolver: given the link target string (e.g. "Foo"), returns the matching
   *  note path, or null if unresolved, or "ambiguous" when multiple match. */
  resolve: (target: string) => string | "ambiguous" | null;
}

export interface Rule {
  id: string;
  defaultSeverity: Severity;
  check(ctx: RuleContext): Violation[];
}

export interface RunStats {
  scanned: number;
  changed: number;
  violations: number;
  durationMs: number;
}
