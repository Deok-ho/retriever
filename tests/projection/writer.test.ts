import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import yaml from "js-yaml";
import { HubService } from "../../src/hub/service.js";
import { VaultProjector } from "../../src/projection/writer.js";

describe("VaultProjector", () => {
  let tmpDir: string;
  let hubDir: string;
  let vaultDir: string;
  let hub: HubService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-projection-"));
    hubDir = path.join(tmpDir, "hub");
    vaultDir = path.join(tmpDir, "vault");
    fs.mkdirSync(hubDir, { recursive: true });
    fs.mkdirSync(vaultDir, { recursive: true });
    hub = new HubService({
      dbPath: path.join(hubDir, "hub.db"),
      attachmentsDir: path.join(hubDir, "attachments"),
    });
  });

  afterEach(() => {
    hub.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes ticket stubs and dashboards", async () => {
    hub.projects.upsert({
      project_id: "alpha",
      status: "active",
      priority: "high",
      phase: "v1",
      purpose: "automation",
      goal: "ship MVP",
    });
    hub.tickets.create({
      project_id: "alpha",
      task_id: "t1",
      summary: "first ticket",
      priority: "high",
      task_type: "구현",
      completion_criteria: ["build", "test"],
    });

    const projector = new VaultProjector(hub, { vaultPath: vaultDir });
    const summary = await projector.sync({ includeDashboard: true });

    expect(summary.projects).toBe(1);
    expect(summary.tickets).toBe(1);
    expect(summary.dashboard).toBe(true);

    const ticketPath = path.join(vaultDir, "_tasks", "alpha", "t1.md");
    expect(fs.existsSync(ticketPath)).toBe(true);
    const ticketContent = fs.readFileSync(ticketPath, "utf-8");
    expect(ticketContent).toContain("readonly: true");
    expect(ticketContent).toContain("first ticket");
    expect(ticketContent).toContain("- [ ] build");
    expect(ticketContent).toContain("- [ ] test");

    const portfolioPath = path.join(vaultDir, "_dashboard", "portfolio.md");
    expect(fs.existsSync(portfolioPath)).toBe(true);
    const portfolio = fs.readFileSync(portfolioPath, "utf-8");
    expect(portfolio).toContain("alpha");
    expect(portfolio).toContain("high");

    const projectBoardPath = path.join(vaultDir, "_dashboard", "alpha.md");
    expect(fs.existsSync(projectBoardPath)).toBe(true);
  });

  it("preserves user content in project hub stub on re-sync", async () => {
    hub.projects.upsert({
      project_id: "beta",
      status: "active",
      priority: "med",
    });

    const hubPath = path.join(vaultDir, "beta.md");

    // First sync — creates stub
    const projector = new VaultProjector(hub, { vaultPath: vaultDir });
    await projector.sync({ includeDashboard: false });
    expect(fs.existsSync(hubPath)).toBe(true);

    // Simulate user editing: add custom frontmatter key + body content
    const initial = fs.readFileSync(hubPath, "utf-8");
    const m = initial.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    expect(m).toBeTruthy();
    const fm = yaml.load(m![1]) as Record<string, unknown>;
    fm["my_custom_field"] = "preserve me";
    fm["tags"] = ["프로젝트/beta", "active"];
    const userBody = m![2] + "\n\n## 내 메모\n\n사용자가 직접 작성한 노트입니다.\n";
    fs.writeFileSync(
      hubPath,
      `---\n${yaml.dump(fm).trimEnd()}\n---\n${userBody}`,
      "utf-8"
    );

    // Hub state changes
    hub.projects.upsert({
      project_id: "beta",
      status: "paused",
      priority: "high",
    });

    // Re-sync
    await projector.sync({ includeDashboard: false });

    const updated = fs.readFileSync(hubPath, "utf-8");
    expect(updated).toContain("my_custom_field: preserve me");
    expect(updated).toContain("내 메모");
    expect(updated).toContain("사용자가 직접 작성한 노트입니다");
    // managed keys updated
    const m2 = updated.match(/^---\n([\s\S]*?)\n---/);
    const fm2 = yaml.load(m2![1]) as Record<string, unknown>;
    expect(fm2["status"]).toBe("paused");
    expect(fm2["priority"]).toBe("high");
    expect(fm2["managed_by"]).toBe("retriever-hub");
  });

  it("filters by project_id when provided", async () => {
    hub.projects.upsert({ project_id: "p1" });
    hub.projects.upsert({ project_id: "p2" });
    hub.tickets.create({ project_id: "p1", task_id: "t1", summary: "p1 ticket" });
    hub.tickets.create({ project_id: "p2", task_id: "t2", summary: "p2 ticket" });

    const projector = new VaultProjector(hub, { vaultPath: vaultDir });
    const summary = await projector.sync({ project_id: "p1", includeDashboard: false });

    expect(summary.projects).toBe(1);
    expect(summary.tickets).toBe(1);
    expect(fs.existsSync(path.join(vaultDir, "_tasks", "p1", "t1.md"))).toBe(true);
    expect(fs.existsSync(path.join(vaultDir, "_tasks", "p2", "t2.md"))).toBe(false);
  });
});
