import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { Projector } from "../../src/core/projector.js";
import {
  createTestStore,
  seedStore,
  seedProject,
  type TestStore,
} from "../fixtures/setup.js";

describe("Projector", () => {
  let store: TestStore;
  let tmpProject: string;

  beforeEach(async () => {
    store = createTestStore();
    await seedStore(store);
    await seedProject(store, "test-project");

    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-proj-"));
    // Init as git repo for persona apply
    execFileSync("git", ["init"], { cwd: tmpProject });
    fs.writeFileSync(path.join(tmpProject, "CLAUDE.md"), "# Old rules");
  });

  afterEach(() => {
    store.cleanup();
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it("applies rules from global + project to local", async () => {
    const projector = new Projector({
      storePath: store.storePath,
      deviceName: "TEST-PC",
    });

    await projector.applyRules("test-project", tmpProject);

    // Global rule should be applied
    const globalRule = fs.readFileSync(
      path.join(tmpProject, ".claude", "rules", "core.md"),
      "utf-8"
    );
    expect(globalRule).toContain("Core Rules");

    // Project rule should be applied
    const projectRule = fs.readFileSync(
      path.join(tmpProject, ".claude", "rules", "project.md"),
      "utf-8"
    );
    expect(projectRule).toContain("Project Rules");
  });

  it("applies persona git config", async () => {
    const projector = new Projector({
      storePath: store.storePath,
      deviceName: "TEST-PC",
    });

    await projector.applyPersona("test-project", tmpProject);

    const userName = execFileSync("git", ["config", "user.name"], {
      cwd: tmpProject,
      encoding: "utf-8",
    }).trim();
    const userEmail = execFileSync("git", ["config", "user.email"], {
      cwd: tmpProject,
      encoding: "utf-8",
    }).trim();

    // test-project uses "company" persona
    expect(userName).toBe("testuser-co");
    expect(userEmail).toBe("test@company.com");
  });
});
