import * as fs from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";
import type { HubService } from "../hub/service.js";
import type { Project, Ticket } from "../db/types.js";
import {
  renderTicketStub,
  renderPortfolioBoard,
  renderProjectBoard,
  renderProjectHubManagedFm,
  mergeProjectHubFrontmatter,
} from "./templates.js";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export interface ProjectorConfig {
  vaultPath: string; // e.g. /vault/20_Resource/개인작업물_Coding
  projectHubFilename?: (project_id: string) => string; // default: `${id}.md`
}

export interface SyncOptions {
  project_id?: string;
  includeDashboard?: boolean;
  /** Skip writing project hub stubs (only update ticket stubs + dashboard). Default false. */
  skipProjectHubs?: boolean;
}

export interface SyncSummary {
  projects: number;
  tickets: number;
  dashboard: boolean;
  vaultPath: string;
}

/**
 * Writes hub data into the vault as markdown projections.
 * - Project hub stubs: frontmatter merge (preserves user content/keys outside managed list)
 * - Ticket stubs: full overwrite, readonly markers
 * - Dashboards: full overwrite
 */
export class VaultProjector {
  constructor(
    private readonly hub: HubService,
    private readonly config: ProjectorConfig
  ) {}

  async sync(opts: SyncOptions = {}): Promise<SyncSummary> {
    const projects: Project[] = opts.project_id
      ? [this.hub.projects.get(opts.project_id)].filter(Boolean) as Project[]
      : this.hub.projects.list();

    let ticketCount = 0;
    for (const p of projects) {
      ticketCount += await this.syncProject(p, { skipProjectHubs: opts.skipProjectHubs ?? false });
    }

    let dashboard = false;
    if (opts.includeDashboard !== false) {
      await this.syncDashboards(opts.project_id);
      dashboard = true;
    }

    return {
      projects: projects.length,
      tickets: ticketCount,
      dashboard,
      vaultPath: this.config.vaultPath,
    };
  }

  /** Sync a single project: project hub stub + all its tickets. Returns ticket count. */
  private async syncProject(
    project: Project,
    opts: { skipProjectHubs: boolean }
  ): Promise<number> {
    if (!opts.skipProjectHubs) {
      await this.writeProjectHubStub(project);
    }

    const tickets = this.hub.tickets.list({ project_id: project.project_id });
    for (const t of tickets) {
      const full = this.hub.tickets.readFull(project.project_id, t.task_id);
      if (!full) continue;
      await this.writeTicketStub(full);
    }
    return tickets.length;
  }

  private async writeProjectHubStub(project: Project): Promise<void> {
    const filename = this.config.projectHubFilename
      ? this.config.projectHubFilename(project.project_id)
      : `${project.project_id}.md`;
    const target = path.join(this.config.vaultPath, filename);

    const existing = await this.readMarkdownIfExists(target);
    const managedFm = renderProjectHubManagedFm(project);
    const mergedFm = mergeProjectHubFrontmatter(existing?.frontmatter ?? null, managedFm);

    let body: string;
    if (existing) {
      body = existing.body;
    } else {
      body = this.renderInitialProjectHubBody(project);
    }

    const content = ["---", yaml.dump(mergedFm, { lineWidth: 120 }).trimEnd(), "---", "", body.trimEnd(), ""].join(
      "\n"
    );
    await this.atomicWrite(target, content);
  }

  private async writeTicketStub(ticket: import("../db/types.js").TicketFull): Promise<void> {
    const target = path.join(
      this.config.vaultPath,
      "_tasks",
      ticket.project_id,
      `${ticket.task_id}.md`
    );
    const content = renderTicketStub(ticket);
    await this.atomicWrite(target, content);
  }

  private async syncDashboards(projectIdFilter?: string): Promise<void> {
    const projects = projectIdFilter
      ? ([this.hub.projects.get(projectIdFilter)].filter(Boolean) as Project[])
      : this.hub.projects.list();

    if (!projectIdFilter) {
      const ticketsByProject = new Map<string, Ticket[]>();
      for (const p of projects) {
        ticketsByProject.set(p.project_id, this.hub.tickets.list({ project_id: p.project_id }));
      }
      const portfolio = renderPortfolioBoard(projects, ticketsByProject);
      await this.atomicWrite(
        path.join(this.config.vaultPath, "_dashboard", "portfolio.md"),
        portfolio
      );
    }

    for (const p of projects) {
      const tickets = this.hub.tickets.list({ project_id: p.project_id });
      const md = renderProjectBoard(p, tickets);
      await this.atomicWrite(
        path.join(this.config.vaultPath, "_dashboard", `${p.project_id}.md`),
        md
      );
    }
  }

  private renderInitialProjectHubBody(p: Project): string {
    const lines: string[] = [];
    lines.push(`# ${p.project_id}`);
    lines.push("");
    if (p.purpose || p.goal) {
      if (p.purpose) lines.push(`- 목적: ${p.purpose}`);
      if (p.goal) lines.push(`- 목표: ${p.goal}`);
      lines.push("");
    }
    lines.push("## 활성 티켓");
    lines.push("");
    lines.push(`> 관제보드: \`_dashboard/${p.project_id}.md\``);
    lines.push("");
    lines.push("## 작업 로그");
    lines.push("");
    lines.push("_생성된 스텁입니다. 본 섹션 아래는 사용자가 자유롭게 편집해도 보존됩니다._");
    lines.push("");
    return lines.join("\n");
  }

  private async readMarkdownIfExists(
    filePath: string
  ): Promise<{ frontmatter: Record<string, unknown> | null; body: string } | null> {
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      return null;
    }
    const m = content.match(FRONTMATTER_RE);
    if (!m) return { frontmatter: null, body: content };
    let fm: Record<string, unknown> | null = null;
    try {
      const parsed = yaml.load(m[1]);
      if (parsed && typeof parsed === "object") fm = parsed as Record<string, unknown>;
    } catch {
      fm = null;
    }
    return { frontmatter: fm, body: m[2] };
  }

  private async atomicWrite(target: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, content, "utf-8");
    await fs.rename(tmp, target);
  }
}

export function loadProjectorFromEnv(hub: HubService): VaultProjector | null {
  const vaultPath = process.env.RTV_VAULT_PATH;
  if (!vaultPath) return null;
  return new VaultProjector(hub, { vaultPath });
}
