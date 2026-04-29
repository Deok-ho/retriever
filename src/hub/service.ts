import type Database from "better-sqlite3";
import { openHubDb, loadHubDbConfig, type HubDbConfig } from "../db/database.js";
import { ProjectRepo } from "../db/repositories/projects.js";
import { TicketRepo } from "../db/repositories/tickets.js";
import { AttachmentRepo } from "../db/repositories/attachments.js";
import { SessionRepo } from "../sessions/repo.js";
import { Gemma4Adapter } from "../adapters/gemma4.js";
import { loadGemma4Config } from "../config.js";

export class HubService {
  readonly db: Database.Database;
  readonly projects: ProjectRepo;
  readonly tickets: TicketRepo;
  readonly attachments: AttachmentRepo;
  readonly sessions: SessionRepo;
  readonly gemma4: Gemma4Adapter;
  readonly config: HubDbConfig;

  constructor(config?: HubDbConfig) {
    this.config = config ?? loadHubDbConfig();
    this.db = openHubDb(this.config);
    this.projects = new ProjectRepo(this.db);
    this.tickets = new TicketRepo(this.db);
    this.attachments = new AttachmentRepo(this.db, {
      attachmentsDir: this.config.attachmentsDir,
    });
    this.sessions = new SessionRepo(this.db);
    this.gemma4 = new Gemma4Adapter(loadGemma4Config());
  }

  close(): void {
    this.db.close();
  }
}
