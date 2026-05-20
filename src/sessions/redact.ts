import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

export interface RedactPattern {
  name: string;
  regex: string;
  placeholder: string;
  _compiled?: RegExp;
}

export type RedactCounts = Record<string, number>;

export interface RedactResult {
  redacted: string;
  counts: RedactCounts;
}

export interface RedactOptions {
  patterns?: RedactPattern[];
  allowlist?: RegExp[];
}

let cachedPatterns: RedactPattern[] | null = null;

function patternsYamlPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "redact-patterns.yaml");
}

export function loadRedactPatterns(forceReload = false): RedactPattern[] {
  if (cachedPatterns && !forceReload) return cachedPatterns;
  const raw = readFileSync(patternsYamlPath(), "utf-8");
  const parsed = yaml.load(raw) as { patterns: RedactPattern[] };
  if (!parsed?.patterns?.length) {
    throw new Error("redact-patterns.yaml: no patterns defined");
  }
  cachedPatterns = parsed.patterns.map((p) => ({
    ...p,
    _compiled: new RegExp(p.regex, "g"),
  }));
  return cachedPatterns;
}

export function redactSecrets(
  input: string,
  opts: RedactOptions = {},
): RedactResult {
  const patterns = opts.patterns ?? loadRedactPatterns();
  const allowlist = opts.allowlist ?? [];
  const counts: RedactCounts = {};
  let redacted = input;

  for (const pattern of patterns) {
    const re =
      pattern._compiled ?? new RegExp(pattern.regex, "g");
    re.lastIndex = 0;
    redacted = redacted.replace(re, (match) => {
      for (const allow of allowlist) {
        if (allow.test(match)) return match;
      }
      counts[pattern.name] = (counts[pattern.name] ?? 0) + 1;
      return pattern.placeholder;
    });
  }

  return { redacted, counts };
}

export function totalRedactions(counts: RedactCounts): number {
  let n = 0;
  for (const k of Object.keys(counts)) n += counts[k];
  return n;
}
