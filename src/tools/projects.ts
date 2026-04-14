import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RtvConfig, Manifest, Snapshot } from "../types.js";
import { paths } from "../config.js";
import { readYaml } from "../utils/yaml.js";

interface ProjectSummary {
  name: string;
  persona: string;
  hasSnapshot: boolean;
  lastCollected: string;
}

export async function handleProjects(
  config: RtvConfig
): Promise<ProjectSummary[]> {
  const p = paths(config);
  const desiredDir = path.join(config.storePath, "desired-state");

  let entries: string[];
  try {
    entries = await fs.readdir(desiredDir);
  } catch {
    return [];
  }

  const projects: ProjectSummary[] = [];
  for (const entry of entries) {
    const manifest = await readYaml<Manifest>(p.manifest(entry));
    if (!manifest) continue;

    const snapshot = await readYaml<Snapshot>(p.snapshot(entry));

    projects.push({
      name: manifest.project.name,
      persona: manifest.persona,
      hasSnapshot: snapshot !== null,
      lastCollected: snapshot?.collected_at ?? "",
    });
  }

  return projects;
}
