import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { ToolAdapter, HarnessSnapshot, Persona } from "../types.js";
import { hashFile } from "../utils/hash.js";

const exec = promisify(execFile);

export class ClaudeCodeAdapter implements ToolAdapter {
  name = "claude-code";

  /**
   * Find all CLAUDE.md files from projectPath up to filesystem root.
   * Claude Code reads CLAUDE.md from the project dir and every parent.
   */
  private async findClaudeMdChain(projectPath: string): Promise<string[]> {
    const found: string[] = [];
    let current = path.resolve(projectPath);
    const root = path.parse(current).root;

    while (true) {
      const candidate = path.join(current, "CLAUDE.md");
      try {
        await fs.access(candidate);
        found.push(candidate);
      } catch {
        // not here
      }
      if (current === root) break;
      current = path.dirname(current);
    }
    return found;
  }

  async detect(projectPath?: string): Promise<boolean> {
    if (projectPath) {
      // Check CLAUDE.md in project or any parent
      const chain = await this.findClaudeMdChain(projectPath);
      if (chain.length > 0) return true;

      // Check .claude/ directory
      try {
        await fs.access(path.join(projectPath, ".claude"));
        return true;
      } catch {
        // no .claude dir
      }

      return false;
    }
    try {
      await exec("claude", ["--version"]);
      return true;
    } catch {
      return false;
    }
  }

  async collectHarness(projectPath: string): Promise<HarnessSnapshot> {
    let rulesCount = 0;
    const hashParts: string[] = [];

    // Check CLAUDE.md chain (project + parents)
    const claudeMdChain = await this.findClaudeMdChain(projectPath);
    for (const mdPath of claudeMdChain) {
      const h = await hashFile(mdPath);
      if (h) {
        rulesCount++;
        hashParts.push(h);
      }
    }

    // Check project .claude/rules/
    const rulesDir = path.join(projectPath, ".claude", "rules");
    try {
      const entries = await fs.readdir(rulesDir);
      const mdFiles = entries.filter((e) => e.endsWith(".md"));
      rulesCount += mdFiles.length;
      for (const file of mdFiles.sort()) {
        const h = await hashFile(path.join(rulesDir, file));
        if (h) hashParts.push(h);
      }
    } catch {
      // no rules dir
    }

    // Check global ~/.claude/CLAUDE.md and ~/.claude/rules/
    const os = await import("node:os");
    const globalClaudeDir = path.join(os.homedir(), ".claude");

    const globalClaudeMd = path.join(globalClaudeDir, "CLAUDE.md");
    const globalHash = await hashFile(globalClaudeMd);
    if (globalHash) {
      rulesCount++;
      hashParts.push(globalHash);
    }

    const globalRulesDir = path.join(globalClaudeDir, "rules");
    try {
      const entries = await fs.readdir(globalRulesDir);
      const mdFiles = entries.filter((e) => e.endsWith(".md"));
      rulesCount += mdFiles.length;
      for (const file of mdFiles.sort()) {
        const h = await hashFile(path.join(globalRulesDir, file));
        if (h) hashParts.push(h);
      }
    } catch {
      // no global rules dir
    }

    // Check memory — Claude Code stores project memory in
    // ~/.claude/projects/{project-id}/memory/
    // project-id: path with ':' '/' '\' → '-', case-insensitive match
    let memoryCount = 0;
    const projectIdNorm = path.resolve(projectPath)
      .replace(/[:\/\\]/g, "-")
      .replace(/^-/, "")
      .toLowerCase();
    let projectMemDir = "";
    const projectsDir = path.join(globalClaudeDir, "projects");
    try {
      const dirs = await fs.readdir(projectsDir);
      const match = dirs.find((d) => d.toLowerCase() === projectIdNorm);
      if (match) {
        projectMemDir = path.join(projectsDir, match, "memory");
      }
    } catch {
      // no projects dir
    }
    if (projectMemDir) {
      try {
        const entries = await fs.readdir(projectMemDir);
        memoryCount = entries.filter((e) => e.endsWith(".md") && e !== "MEMORY.md").length;
      } catch {
        // no memory dir
      }
    }

    const combinedHash =
      hashParts.length > 0
        ? createHash("sha256").update(hashParts.join(":")).digest("hex")
        : "";

    return {
      rules_hash: combinedHash || undefined,
      rules_count: rulesCount,
      memory_count: memoryCount,
    };
  }

  async applyRules(
    desiredRulesDir: string,
    projectPath: string
  ): Promise<void> {
    const targetDir = path.join(projectPath, ".claude", "rules");
    await fs.mkdir(targetDir, { recursive: true });

    const entries = await fs.readdir(desiredRulesDir);
    for (const entry of entries) {
      const src = path.join(desiredRulesDir, entry);
      const dest = path.join(targetDir, entry);
      const stat = await fs.stat(src);
      if (stat.isFile()) {
        await fs.copyFile(src, dest);
      }
    }
  }

  async applyPersona(persona: Persona): Promise<void> {
    await exec("git", ["config", "user.name", persona.git_user]);
    await exec("git", ["config", "user.email", persona.git_email]);
  }

  supportsNativeMemory(): boolean {
    return true;
  }
}
