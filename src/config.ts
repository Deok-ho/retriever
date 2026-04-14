import * as os from "node:os";
import * as path from "node:path";
import type { RtvConfig } from "./types.js";

export function loadConfig(): RtvConfig {
  const storePath =
    process.env.RTV_STORE_PATH ??
    path.join(os.homedir(), ".retriever", "store");
  const deviceName = process.env.RTV_DEVICE_NAME ?? os.hostname();

  return { storePath, deviceName };
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
  };
}
