import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RtvConfig, MemoryEntry, MemoryType } from "../types.js";
import { paths } from "../config.js";
import {
  listMemoryDir,
  parseMemory,
  serializeMemory,
} from "../utils/memory-parser.js";

export class MemoryManager {
  private config: RtvConfig;

  constructor(config: RtvConfig) {
    this.config = config;
  }

  async list(
    project: string,
    type?: MemoryType
  ): Promise<MemoryEntry[]> {
    const p = paths(this.config);

    // Load global memories
    const globalEntries = await listMemoryDir(p.global.memory);
    for (const e of globalEntries) e.source = "global";

    // Load project memories
    const projectEntries = await listMemoryDir(p.projectMemory(project));
    for (const e of projectEntries) e.source = "project";

    // Merge: project overrides global by name
    const merged = new Map<string, MemoryEntry>();
    for (const e of globalEntries) merged.set(e.name, e);
    for (const e of projectEntries) merged.set(e.name, e);

    let result = Array.from(merged.values());

    if (type) {
      result = result.filter((e) => e.type === type);
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async search(
    project: string,
    query: string
  ): Promise<MemoryEntry[]> {
    const all = await this.list(project);
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

    if (keywords.length === 0) return all;

    return all.filter((entry) => {
      const text = [entry.name, entry.description, entry.body]
        .join(" ")
        .toLowerCase();
      return keywords.every((kw) => text.includes(kw));
    });
  }

  async read(
    project: string,
    name: string
  ): Promise<MemoryEntry | null> {
    const p = paths(this.config);

    // Try project first
    const projectDir = p.projectMemory(project);
    const projectEntry = await this.findByName(projectDir, name);
    if (projectEntry) {
      projectEntry.source = "project";
      return projectEntry;
    }

    // Fall back to global
    const globalEntry = await this.findByName(p.global.memory, name);
    if (globalEntry) {
      globalEntry.source = "global";
      return globalEntry;
    }

    return null;
  }

  async write(
    project: string,
    entry: Omit<MemoryEntry, "filePath" | "source">
  ): Promise<void> {
    const p = paths(this.config);
    const memDir = p.projectMemory(project);
    await fs.mkdir(memDir, { recursive: true });

    // Use name as filename (sanitize minimally)
    const fileName = `${entry.name}.md`;
    const filePath = path.join(memDir, fileName);

    const content = serializeMemory(entry as MemoryEntry);
    await fs.writeFile(filePath, content, "utf-8");
  }

  async delete(
    project: string,
    name: string
  ): Promise<boolean> {
    const p = paths(this.config);
    const memDir = p.projectMemory(project);

    // Only delete from project memory
    const entry = await this.findByName(memDir, name);
    if (!entry || !entry.filePath) return false;

    try {
      await fs.unlink(entry.filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async findByName(
    dirPath: string,
    name: string
  ): Promise<MemoryEntry | null> {
    const entries = await listMemoryDir(dirPath);
    return entries.find((e) => e.name === name) ?? null;
  }
}
