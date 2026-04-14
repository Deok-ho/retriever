import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  RtvConfig,
  Manifest,
  GlobalSettings,
  PersonasFile,
} from "../types.js";
import { paths } from "../config.js";
import { readYaml } from "../utils/yaml.js";

const exec = promisify(execFile);

export class Projector {
  private config: RtvConfig;

  constructor(config: RtvConfig) {
    this.config = config;
  }

  async applyRules(projectName: string, projectPath: string): Promise<string[]> {
    const p = paths(this.config);
    const applied: string[] = [];

    const targetDir = path.join(projectPath, ".claude", "rules");
    await fs.mkdir(targetDir, { recursive: true });

    // Copy global rules
    try {
      const globalEntries = await fs.readdir(p.global.rules);
      for (const entry of globalEntries) {
        const src = path.join(p.global.rules, entry);
        const dest = path.join(targetDir, entry);
        const stat = await fs.stat(src);
        if (stat.isFile()) {
          await fs.copyFile(src, dest);
          applied.push(`global/${entry}`);
        }
      }
    } catch {
      // no global rules
    }

    // Copy project rules (overrides global)
    const projectRulesDir = path.join(
      p.desiredState(projectName),
      "rules"
    );
    try {
      const projectEntries = await fs.readdir(projectRulesDir);
      for (const entry of projectEntries) {
        const src = path.join(projectRulesDir, entry);
        const dest = path.join(targetDir, entry);
        const stat = await fs.stat(src);
        if (stat.isFile()) {
          await fs.copyFile(src, dest);
          applied.push(`project/${entry}`);
        }
      }
    } catch {
      // no project rules
    }

    return applied;
  }

  async applyPersona(
    projectName: string,
    projectPath: string
  ): Promise<string> {
    const p = paths(this.config);
    const manifest = await readYaml<Manifest>(p.manifest(projectName));
    const globalSettings = await readYaml<GlobalSettings>(p.global.settings);
    const personasFile = await readYaml<PersonasFile>(p.personas);

    const personaName =
      manifest?.persona ?? globalSettings?.default_persona ?? "";
    if (!personaName || !personasFile?.personas[personaName]) {
      return `persona "${personaName}" not found`;
    }

    const persona = personasFile.personas[personaName];
    await exec("git", ["config", "user.name", persona.git_user], {
      cwd: projectPath,
    });
    await exec("git", ["config", "user.email", persona.git_email], {
      cwd: projectPath,
    });

    return `persona "${personaName}" applied (${persona.git_user} <${persona.git_email}>)`;
  }

  async applyAll(
    projectName: string,
    projectPath: string
  ): Promise<{ rules: string[]; persona: string }> {
    const rules = await this.applyRules(projectName, projectPath);
    const persona = await this.applyPersona(projectName, projectPath);
    return { rules, persona };
  }
}
