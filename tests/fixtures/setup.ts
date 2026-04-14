import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeYaml } from "../../src/utils/yaml.js";
import type { Manifest, PersonasFile, GlobalSettings } from "../../src/types.js";

export interface TestStore {
  storePath: string;
  deviceName: string;
  cleanup: () => void;
}

export function createTestStore(): TestStore {
  const storePath = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-test-"));
  const deviceName = "TEST-PC";

  return {
    storePath,
    deviceName,
    cleanup: () => fs.rmSync(storePath, { recursive: true, force: true }),
  };
}

export async function seedStore(store: TestStore): Promise<void> {
  const { storePath } = store;

  const personas: PersonasFile = {
    personas: {
      personal: { git_user: "testuser", git_email: "test@personal.com" },
      company: { git_user: "testuser-co", git_email: "test@company.com" },
    },
  };
  await writeYaml(path.join(storePath, "personas.yaml"), personas);

  const globalSettings: GlobalSettings = {
    default_persona: "personal",
    env: {
      ANTHROPIC_API_KEY: { source: "keyring", required: true },
    },
  };
  await writeYaml(
    path.join(storePath, "global", "settings.yaml"),
    globalSettings
  );

  // Create a global rule file
  fs.mkdirSync(path.join(storePath, "global", "rules"), { recursive: true });
  fs.writeFileSync(
    path.join(storePath, "global", "rules", "core.md"),
    "# Core Rules\n- 응답 언어: 한국어\n"
  );
}

export async function seedProject(
  store: TestStore,
  projectName: string
): Promise<void> {
  const projectDir = path.join(
    store.storePath,
    "desired-state",
    projectName
  );

  const manifest: Manifest = {
    project: {
      name: projectName,
      description: "Test project",
      created: "2026-04-14",
    },
    persona: "company",
    env: {
      TEST_KEY: { source: "env", required: false },
    },
    harness: {
      "claude-code": {
        rules: "./rules/",
        memory: "./memory/",
      },
    },
    sync: {
      sessions: true,
      conversations: true,
      tasks: true,
      plans: true,
    },
  };
  await writeYaml(path.join(projectDir, "manifest.yaml"), manifest);

  // Create a project-specific rule
  fs.mkdirSync(path.join(projectDir, "rules"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "rules", "project.md"),
    "# Project Rules\n- This project specific rule\n"
  );
}
