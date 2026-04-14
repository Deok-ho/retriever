import * as path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { RtvConfig } from "../types.js";
import { Collector } from "./collector.js";

export class Watchdog {
  private config: RtvConfig;
  private watchers: Map<string, FSWatcher> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private collector: Collector;

  constructor(config: RtvConfig) {
    this.config = config;
    this.collector = new Collector(config);
  }

  watch(projectName: string, projectPath: string): void {
    // Avoid duplicate watchers
    if (this.watchers.has(projectName)) return;

    const patterns = [
      path.join(projectPath, "CLAUDE.md"),
      path.join(projectPath, ".claude", "rules", "**", "*.md"),
      path.join(projectPath, ".codex", "instructions.md"),
    ];

    const watcher = chokidar.watch(patterns, {
      ignoreInitial: true,
      persistent: true,
    });

    watcher.on("change", () => this.onFileChange(projectName, projectPath));
    watcher.on("add", () => this.onFileChange(projectName, projectPath));
    watcher.on("unlink", () => this.onFileChange(projectName, projectPath));

    this.watchers.set(projectName, watcher);
  }

  unwatch(projectName: string): void {
    const watcher = this.watchers.get(projectName);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectName);
    }
    const timer = this.debounceTimers.get(projectName);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(projectName);
    }
  }

  async close(): Promise<void> {
    for (const [name] of this.watchers) {
      this.unwatch(name);
    }
  }

  private onFileChange(projectName: string, projectPath: string): void {
    // Debounce 500ms
    const existing = this.debounceTimers.get(projectName);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(projectName);
      try {
        await this.collector.collect(projectName, projectPath);
      } catch {
        // Silently ignore collect errors from watchdog
      }
    }, 500);

    this.debounceTimers.set(projectName, timer);
  }
}
