import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  RtvConfig,
  Manifest,
  GlobalSettings,
  PersonasFile,
  Snapshot,
  HarnessSnapshot,
} from "../types.js";
import { paths } from "../config.js";
import { readYaml, writeYaml } from "../utils/yaml.js";
import { getRepoState } from "../utils/git.js";
import { ClaudeCodeAdapter } from "../adapters/claude-code.js";
import { CodexAdapter } from "../adapters/codex.js";
import type { ToolAdapter } from "../adapters/base.js";

const exec = promisify(execFile);

export class Collector {
  private config: RtvConfig;
  private adapters: ToolAdapter[];

  constructor(config: RtvConfig) {
    this.config = config;
    this.adapters = [new ClaudeCodeAdapter(), new CodexAdapter()];
  }

  async collect(projectName: string, projectPath: string): Promise<Snapshot> {
    const p = paths(this.config);

    // Load manifest + global settings
    const manifest = await readYaml<Manifest>(p.manifest(projectName));
    const globalSettings = await readYaml<GlobalSettings>(p.global.settings);

    // Collect repo state
    const repo = (await getRepoState(projectPath)) ?? {
      path: projectPath,
      branch: "",
      last_commit: "",
      dirty: false,
      uncommitted_files: 0,
      remote: "",
      remote_sync: "",
    };

    // Collect harness state per adapter
    const harness: Record<string, HarnessSnapshot> = {};
    for (const adapter of this.adapters) {
      if (await adapter.detect(projectPath)) {
        harness[adapter.name] = await adapter.collectHarness(projectPath);
      }
    }

    // Collect env status
    const envDeclarations = {
      ...globalSettings?.env,
      ...manifest?.env,
    };
    const env: Record<string, "set" | "missing"> = {};
    for (const key of Object.keys(envDeclarations)) {
      env[key] = process.env[key] ? "set" : "missing";
    }

    // Determine persona match
    const desiredPersona = manifest?.persona ?? globalSettings?.default_persona ?? "";
    let currentPersona = "";
    try {
      const { stdout: userName } = await exec("git", ["config", "user.name"], {
        cwd: projectPath,
      });
      // Look up which persona matches this git user
      const personasFile = await readYaml<PersonasFile>(p.personas);
      if (personasFile) {
        for (const [name, persona] of Object.entries(personasFile.personas)) {
          if (persona.git_user === userName.trim()) {
            currentPersona = name;
            break;
          }
        }
      }
    } catch {
      // no git config
    }

    const snapshot: Snapshot = {
      repo,
      harness,
      env,
      persona: {
        current: currentPersona,
        desired: desiredPersona,
        match: currentPersona === desiredPersona,
      },
      collected_at: new Date().toISOString(),
      device: this.config.deviceName,
    };

    // Write snapshot
    await writeYaml(p.snapshot(projectName), snapshot);

    return snapshot;
  }
}
