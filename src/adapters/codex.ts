import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolAdapter, HarnessSnapshot, Persona } from "../types.js";
import { hashFile } from "../utils/hash.js";

const exec = promisify(execFile);

export class CodexAdapter implements ToolAdapter {
  name = "codex";

  async detect(projectPath?: string): Promise<boolean> {
    if (projectPath) {
      try {
        await fs.access(path.join(projectPath, ".codex"));
        return true;
      } catch {
        return false;
      }
    }
    // Check global ~/.codex/
    try {
      const os = await import("node:os");
      await fs.access(path.join(os.homedir(), ".codex"));
      return true;
    } catch {
      return false;
    }
  }

  async collectHarness(projectPath: string): Promise<HarnessSnapshot> {
    const instructionsPath = path.join(
      projectPath,
      ".codex",
      "instructions.md"
    );
    const hash = await hashFile(instructionsPath);

    return {
      instructions_hash: hash ?? undefined,
      rules_count: hash ? 1 : 0,
    };
  }

  async applyRules(
    desiredRulesDir: string,
    projectPath: string
  ): Promise<void> {
    const targetDir = path.join(projectPath, ".codex");
    await fs.mkdir(targetDir, { recursive: true });

    // Read all rule files and concat into single instructions.md
    const entries = await fs.readdir(desiredRulesDir);
    const mdFiles = entries.filter((e) => e.endsWith(".md")).sort();

    const parts: string[] = [];
    for (const file of mdFiles) {
      const content = await fs.readFile(
        path.join(desiredRulesDir, file),
        "utf-8"
      );
      parts.push(content.trimEnd());
    }

    const merged = parts.join("\n\n");
    await fs.writeFile(
      path.join(targetDir, "instructions.md"),
      merged,
      "utf-8"
    );
  }

  async applyPersona(persona: Persona): Promise<void> {
    await exec("git", ["config", "user.name", persona.git_user]);
    await exec("git", ["config", "user.email", persona.git_email]);
  }

  supportsNativeMemory(): boolean {
    return false;
  }
}
