import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseNote } from "./parser.js";
import type { Note } from "./types.js";

export interface ScanOptions {
  vaultRoot: string;
  ignore?: string[];
}

export interface ScanResult {
  notes: Note[];
  errors: { path: string; error: string }[];
}

export async function scanVault(opts: ScanOptions): Promise<ScanResult> {
  const root = path.resolve(opts.vaultRoot);
  const ignoreMatchers = (opts.ignore ?? []).map(compileGlob);

  const notes: Note[] = [];
  const errors: { path: string; error: string }[] = [];

  await walk(root, root, ignoreMatchers, async (rel, abs) => {
    if (!rel.toLowerCase().endsWith(".md")) return;
    try {
      const stat = await fs.stat(abs);
      const bytes = await fs.readFile(abs);
      notes.push(
        parseNote({
          path: rel.split(path.sep).join("/"),
          bytes,
          mtime: stat.mtimeMs,
        })
      );
    } catch (err) {
      errors.push({ path: rel, error: (err as Error).message });
    }
  });

  notes.sort((a, b) => a.path.localeCompare(b.path));
  return { notes, errors };
}

type Visitor = (relPath: string, absPath: string) => Promise<void>;
type Matcher = (relPath: string) => boolean;

async function walk(
  root: string,
  current: string,
  ignore: Matcher[],
  visit: Visitor
): Promise<void> {
  let entries: Array<import("node:fs").Dirent>;
  try {
    entries = (await fs.readdir(current, { withFileTypes: true })) as Array<
      import("node:fs").Dirent
    >;
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = String(entry.name);
    if (name.startsWith(".")) continue;
    const abs = path.join(current, name);
    const rel = path.relative(root, abs);
    const relPosix = rel.split(path.sep).join("/");
    if (ignore.some((m) => m(relPosix))) continue;

    if (entry.isDirectory()) {
      await walk(root, abs, ignore, visit);
    } else if (entry.isFile()) {
      await visit(rel, abs);
    }
  }
}

/** Minimal glob: supports `*`, `**`, and `?`. Anchored to vault root. */
export function compileGlob(pattern: string): (relPath: string) => boolean {
  const normalized = pattern.replace(/\\/g, "/").replace(/\/$/, "");
  const re = globToRegex(normalized);
  return (relPath) => re.test(relPath);
}

function globToRegex(glob: string): RegExp {
  let re = "^";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 2;
        if (glob[i] === "/") i++;
      } else {
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (".+^$()[]{}|\\".includes(c)) {
      re += "\\" + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  re += "(/.*)?$";
  return new RegExp(re);
}
