import { createHash } from "node:crypto";
import yaml from "js-yaml";
import type { Note, WikiLink } from "./types.js";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const H1_RE = /^#\s+(.+?)\s*$/m;
const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;
const TAG_RE = /(?:^|[\s(])#([A-Za-z0-9가-힣_\-/][A-Za-z0-9가-힣_\-/]*)/g;
const FENCE_RE = /```[\s\S]*?```|`[^`\n]*`/g;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

export interface ParseInput {
  /** Path relative to vault root (forward slashes). */
  path: string;
  /** Raw file bytes. */
  bytes: Buffer;
  mtime: number;
}

export function parseNote(input: ParseInput): Note {
  const text = input.bytes.toString("utf-8");
  const hash = createHash("sha256").update(input.bytes).digest("hex");

  const fmMatch = text.match(FRONTMATTER_RE);
  let frontmatter: Record<string, unknown> | null = null;
  let frontmatterRaw: string | null = null;
  let body = text;

  if (fmMatch) {
    frontmatterRaw = fmMatch[0];
    body = text.slice(fmMatch[0].length);
    try {
      const loaded = yaml.load(fmMatch[1]);
      if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
        frontmatter = loaded as Record<string, unknown>;
      } else if (loaded == null) {
        frontmatter = {};
      }
    } catch {
      frontmatter = null;
    }
  }

  const stripped = stripCodeAndComments(body);

  const h1Match = stripped.match(H1_RE);
  const h1 = h1Match ? h1Match[1].trim() : null;

  const wikilinks = extractWikilinks(stripped);
  const tags = extractTags(stripped, frontmatter);

  return {
    path: input.path,
    hash,
    mtime: input.mtime,
    h1,
    frontmatter,
    frontmatterRaw,
    wikilinks,
    tags,
    body,
  };
}

function stripCodeAndComments(text: string): string {
  return text.replace(FENCE_RE, " ").replace(HTML_COMMENT_RE, " ");
}

function extractWikilinks(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const match of text.matchAll(WIKILINK_RE)) {
    const inner = match[1];
    let target = inner;
    let alias: string | null = null;
    let section: string | null = null;

    const pipeIdx = target.indexOf("|");
    if (pipeIdx !== -1) {
      alias = target.slice(pipeIdx + 1).trim();
      target = target.slice(0, pipeIdx);
    }

    const hashIdx = target.indexOf("#");
    if (hashIdx !== -1) {
      section = target.slice(hashIdx + 1).trim();
      target = target.slice(0, hashIdx);
    }

    target = target.trim();
    if (target.length === 0) continue;
    out.push({ target, alias, section });
  }
  return out;
}

function extractTags(
  body: string,
  frontmatter: Record<string, unknown> | null
): string[] {
  const tags = new Set<string>();

  if (frontmatter && "tags" in frontmatter) {
    const raw = frontmatter.tags;
    if (typeof raw === "string") {
      raw
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#/, "").trim())
        .filter(Boolean)
        .forEach((t) => tags.add(t));
    } else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string") {
          const cleaned = item.replace(/^#/, "").trim();
          if (cleaned) tags.add(cleaned);
        }
      }
    }
  }

  for (const match of body.matchAll(TAG_RE)) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}
