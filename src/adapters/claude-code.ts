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

  async detect(projectPath?: string): Promise<boolean> {
    if (projectPath) {
      try {
        await fs.access(path.join(projectPath, "CLAUDE.md"));
        return true;
      } catch {
        return false;
      }
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

    // Check CLAUDE.md
    const claudeMdPath = path.join(projectPath, "CLAUDE.md");
    const claudeMdHash = await hashFile(claudeMdPath);
    if (claudeMdHash) {
      rulesCount++;
      hashParts.push(claudeMdHash);
    }

    // Check .claude/rules/
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

    // Check memory
    let memoryCount = 0;
    try {
      const memDir = path.join(projectPath, ".claude", "memory");
      const entries = await fs.readdir(memDir);
      memoryCount = entries.filter((e) => e.endsWith(".md")).length;
    } catch {
      // no memory dir
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
