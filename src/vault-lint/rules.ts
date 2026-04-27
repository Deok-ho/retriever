import * as path from "node:path";
import type {
  Note,
  Rule,
  RuleContext,
  Severity,
  Violation,
} from "./types.js";

export function buildResolver(
  notes: Note[]
): (target: string) => string | "ambiguous" | null {
  const byPath = new Map<string, string>(); // lowercased path → real path
  const byBasename = new Map<string, string[]>(); // lowercased basename → real paths

  for (const note of notes) {
    byPath.set(note.path.toLowerCase(), note.path);
    const stem = basenameStem(note.path).toLowerCase();
    const list = byBasename.get(stem) ?? [];
    list.push(note.path);
    byBasename.set(stem, list);
  }

  return (rawTarget) => {
    const target = rawTarget.replace(/\\/g, "/").replace(/\.md$/i, "").trim();
    if (!target) return null;

    const direct = byPath.get(target.toLowerCase() + ".md");
    if (direct) return direct;
    const directNoExt = byPath.get(target.toLowerCase());
    if (directNoExt) return directNoExt;

    const stem = basenameStem(target).toLowerCase();
    const matches = byBasename.get(stem);
    if (!matches || matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    return "ambiguous";
  };
}

function basenameStem(p: string): string {
  const base = path.posix.basename(p.replace(/\\/g, "/"));
  return base.replace(/\.md$/i, "");
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const fmRequired: Rule = {
  id: "fm/required",
  defaultSeverity: "error",
  check(ctx) {
    const out: Violation[] = [];
    for (const note of ctx.notes) {
      const fm = note.frontmatter;
      if (fm === null) {
        out.push({
          ruleId: this.id,
          severity: this.defaultSeverity,
          path: note.path,
          message: "frontmatter 가 없습니다 (summary, tags, updated 필요)",
        });
        continue;
      }
      const missing: string[] = [];
      if (!hasNonEmpty(fm.summary)) missing.push("summary");
      if (!("tags" in fm)) missing.push("tags");
      if (!hasNonEmpty(fm.updated)) missing.push("updated");
      if (missing.length > 0) {
        out.push({
          ruleId: this.id,
          severity: this.defaultSeverity,
          path: note.path,
          message: `frontmatter 필수 키 누락: ${missing.join(", ")}`,
        });
      }
    }
    return out;
  },
};

const fmTagsArray: Rule = {
  id: "fm/tags-array",
  defaultSeverity: "error",
  check(ctx) {
    const out: Violation[] = [];
    for (const note of ctx.notes) {
      const fm = note.frontmatter;
      if (!fm || !("tags" in fm)) continue;
      const value = fm.tags;
      if (Array.isArray(value)) {
        if (!value.every((v) => typeof v === "string")) {
          out.push({
            ruleId: this.id,
            severity: this.defaultSeverity,
            path: note.path,
            message: "tags 배열 안에 문자열이 아닌 항목이 섞여 있습니다",
            autoApplyEligible: true,
          });
        }
        continue;
      }
      if (typeof value === "string") {
        out.push({
          ruleId: this.id,
          severity: this.defaultSeverity,
          path: note.path,
          message: "tags 가 문자열입니다 — 배열로 변환하세요",
          autoApplyEligible: true,
        });
      } else {
        out.push({
          ruleId: this.id,
          severity: this.defaultSeverity,
          path: note.path,
          message: "tags 가 배열이 아닙니다",
        });
      }
    }
    return out;
  },
};

const fmUpdatedFormat: Rule = {
  id: "fm/updated-format",
  defaultSeverity: "warn",
  check(ctx) {
    const out: Violation[] = [];
    for (const note of ctx.notes) {
      const fm = note.frontmatter;
      if (!fm) continue;
      const value = fm.updated;
      if (value == null || value === "") continue;
      const str = value instanceof Date ? value.toISOString() : String(value);
      if (!ISO_DATE_RE.test(str)) {
        out.push({
          ruleId: this.id,
          severity: this.defaultSeverity,
          path: note.path,
          message: `updated 가 ISO 날짜 형식이 아닙니다: ${str}`,
          autoApplyEligible: true,
        });
      }
    }
    return out;
  },
};

const linkBroken: Rule = {
  id: "link/broken",
  defaultSeverity: "warn",
  check(ctx) {
    const out: Violation[] = [];
    for (const note of ctx.notes) {
      for (const link of note.wikilinks) {
        const resolved = ctx.resolve(link.target);
        if (resolved === null) {
          out.push({
            ruleId: this.id,
            severity: this.defaultSeverity,
            path: note.path,
            message: `깨진 위키링크: [[${link.target}]]`,
          });
        } else if (resolved === "ambiguous") {
          out.push({
            ruleId: "link/ambiguous",
            severity: "warn",
            path: note.path,
            message: `같은 이름의 노트가 여러 개입니다: [[${link.target}]]`,
          });
        }
      }
    }
    return out;
  },
};

const noteOrphan: Rule = {
  id: "note/orphan",
  defaultSeverity: "info",
  check(ctx) {
    const inbound = new Map<string, number>();
    for (const note of ctx.notes) {
      for (const link of note.wikilinks) {
        const resolved = ctx.resolve(link.target);
        if (typeof resolved === "string" && resolved !== "ambiguous") {
          inbound.set(resolved, (inbound.get(resolved) ?? 0) + 1);
        }
      }
    }

    const out: Violation[] = [];
    for (const note of ctx.notes) {
      if ((inbound.get(note.path) ?? 0) === 0) {
        out.push({
          ruleId: this.id,
          severity: this.defaultSeverity,
          path: note.path,
          message: "어떤 노트에서도 링크되지 않은 고아 노트",
        });
      }
    }
    return out;
  },
};

const noteH1Mismatch: Rule = {
  id: "note/h1-mismatch",
  defaultSeverity: "info",
  check(ctx) {
    const out: Violation[] = [];
    for (const note of ctx.notes) {
      if (!note.h1) continue;
      const stem = path.posix.basename(note.path).replace(/\.md$/i, "");
      if (normalize(stem) !== normalize(note.h1)) {
        out.push({
          ruleId: this.id,
          severity: this.defaultSeverity,
          path: note.path,
          message: `H1 ("${note.h1}") 와 파일명 ("${stem}") 불일치`,
        });
      }
    }
    return out;
  },
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export const ALL_RULES: Rule[] = [
  fmRequired,
  fmTagsArray,
  fmUpdatedFormat,
  linkBroken,
  noteOrphan,
  noteH1Mismatch,
];

export function runRules(
  notes: Note[],
  enabled?: Set<string>,
  severityOverrides?: Map<string, Severity>
): Violation[] {
  const ctx: RuleContext = { notes, resolve: buildResolver(notes) };
  const out: Violation[] = [];
  for (const rule of ALL_RULES) {
    if (enabled && !enabled.has(rule.id)) continue;
    const override = severityOverrides?.get(rule.id);
    const violations = rule.check(ctx);
    for (const v of violations) {
      out.push(override ? { ...v, severity: override } : v);
    }
  }
  return out;
}
