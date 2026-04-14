import * as fs from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";
import type { MemoryEntry } from "../types.js";

export async function parseMemory(
  filePath: string
): Promise<MemoryEntry | null> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  // Parse frontmatter between --- delimiters
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return null;
  }

  const endIndex = content.indexOf("\n---\n", 4);
  const endIndexCrlf = content.indexOf("\r\n---\r\n", 4);
  const endIndexEnd = content.indexOf("\n---", 4);

  let fmEnd: number;
  let bodyStart: number;

  if (endIndex !== -1) {
    fmEnd = endIndex;
    bodyStart = endIndex + 5; // skip \n---\n
  } else if (endIndexCrlf !== -1) {
    fmEnd = endIndexCrlf;
    bodyStart = endIndexCrlf + 7; // skip \r\n---\r\n
  } else if (endIndexEnd !== -1 && endIndexEnd + 4 >= content.length) {
    // --- at end of file
    fmEnd = endIndexEnd;
    bodyStart = content.length;
  } else {
    return null;
  }

  const fmContent = content.substring(4, fmEnd); // skip opening ---\n
  let fm: Record<string, unknown>;
  try {
    fm = yaml.load(fmContent) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!fm || typeof fm !== "object" || !fm.name || !fm.type) {
    return null;
  }

  // Extract body, skip leading newline
  let body = content.substring(bodyStart);
  if (body.startsWith("\n")) body = body.substring(1);
  if (body.startsWith("\r\n")) body = body.substring(2);

  return {
    name: String(fm.name),
    description: String(fm.description ?? ""),
    type: fm.type as MemoryEntry["type"],
    body,
    filePath,
  };
}

export function serializeMemory(entry: MemoryEntry): string {
  const fm = yaml.dump(
    {
      name: entry.name,
      description: entry.description,
      type: entry.type,
    },
    { noCompatMode: true, lineWidth: -1 }
  );

  return `---\n${fm}---\n\n${entry.body}`;
}

export async function listMemoryDir(
  dirPath: string
): Promise<MemoryEntry[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    return [];
  }

  const mdFiles = entries.filter(
    (e) => e.endsWith(".md") && e !== "MEMORY.md"
  );

  const results: MemoryEntry[] = [];
  for (const file of mdFiles.sort()) {
    const entry = await parseMemory(path.join(dirPath, file));
    if (entry) results.push(entry);
  }

  return results;
}
