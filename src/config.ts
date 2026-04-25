import * as os from "node:os";
import * as path from "node:path";
import type { RtvConfig, Gemma4Config } from "./types.js";

export function loadConfig(): RtvConfig {
  const storePath =
    process.env.RTV_STORE_PATH ??
    path.join(os.homedir(), ".retriever", "store");
  const deviceName = process.env.RTV_DEVICE_NAME ?? os.hostname();

  return { storePath, deviceName, gemma4: loadGemma4Config() };
}

export function loadGemma4Config(): Gemma4Config {
  const enabledRaw = process.env.RTV_GEMMA4_ENABLED;
  const enabled = enabledRaw === undefined ? true : enabledRaw === "1" || enabledRaw === "true";
  const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "gemma4:26b-a4b-it-q8_0";
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);
  return { enabled, url, model, timeoutMs };
}

export function paths(config: RtvConfig) {
  const { storePath, deviceName } = config;
  return {
    personas: path.join(storePath, "personas.yaml"),
    global: {
      settings: path.join(storePath, "global", "settings.yaml"),
      rules: path.join(storePath, "global", "rules"),
      memory: path.join(storePath, "global", "memory"),
      skills: path.join(storePath, "global", "skills"),
    },
    desiredState: (project: string) =>
      path.join(storePath, "desired-state", project),
    manifest: (project: string) =>
      path.join(storePath, "desired-state", project, "manifest.yaml"),
    deviceProject: (project: string) =>
      path.join(storePath, "devices", deviceName, project),
    snapshot: (project: string) =>
      path.join(storePath, "devices", deviceName, project, "snapshot.yaml"),
    projectMemory: (project: string) =>
      path.join(storePath, "desired-state", project, "memory"),
  };
}
