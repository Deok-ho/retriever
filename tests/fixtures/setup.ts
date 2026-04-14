import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeYaml } from "../../src/utils/yaml.js";
import { serializeMemory } from "../../src/utils/memory-parser.js";
import type { Manifest, PersonasFile, GlobalSettings, MemoryEntry } from "../../src/types.js";

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

export async function seedMemory(store: TestStore, projectName?: string): Promise<void> {
  // Global memories
  const globalMemDir = path.join(store.storePath, "global", "memory");
  fs.mkdirSync(globalMemDir, { recursive: true });

  const globalMem: MemoryEntry = {
    name: "global-user-profile",
    description: "User profile info",
    type: "user",
    body: "사용자는 백엔드 엔지니어입니다.\n",
  };
  fs.writeFileSync(
    path.join(globalMemDir, "global-user-profile.md"),
    serializeMemory(globalMem)
  );

  const globalFeedback: MemoryEntry = {
    name: "global-feedback",
    description: "Global feedback",
    type: "feedback",
    body: "TDD를 선호합니다.\n",
  };
  fs.writeFileSync(
    path.join(globalMemDir, "global-feedback.md"),
    serializeMemory(globalFeedback)
  );

  // Project memories (if projectName given)
  if (projectName) {
    const projectMemDir = path.join(
      store.storePath, "desired-state", projectName, "memory"
    );
    fs.mkdirSync(projectMemDir, { recursive: true });

    const projectMem: MemoryEntry = {
      name: "project-note",
      description: "Project specific note",
      type: "project",
      body: "이 프로젝트는 MCP 서버입니다.\n",
    };
    fs.writeFileSync(
      path.join(projectMemDir, "project-note.md"),
      serializeMemory(projectMem)
    );
  }
}
