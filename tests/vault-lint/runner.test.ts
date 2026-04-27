import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runVaultLint } from "../../src/vault-lint/runner.js";
import { loadVaultLintConfig } from "../../src/vault-lint/config.js";

describe("runVaultLint (integration)", () => {
  let vault: string;
  let store: string;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-vault-"));
    store = fs.mkdtempSync(path.join(os.tmpdir(), "rtv-store-"));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(store, { recursive: true, force: true });
  });

  function write(rel: string, content: string) {
    const abs = path.join(vault, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf-8");
  }

  it("finds violations in a small vault and writes proposals.md", async () => {
    write(
      "Hub.md",
      `---\nsummary: index\ntags: [hub]\nupdated: 2026-04-24\n---\n\n# Hub\n\n[[Real]] and [[Missing]]\n`
    );
    write(
      "Real.md",
      `---\nsummary: real note\ntags: [t]\nupdated: 2026-04-24\n---\n\n# Real\n\nbody\n`
    );
    write("BadDate.md", `---\nsummary: x\ntags: [t]\nupdated: 2026/04/24\n---\n\n# BadDate\n`);
    write("NoFm.md", "# NoFm\n\nbody\n");

    const config = await loadVaultLintConfig("/nonexistent.yaml", {
      vaultRoot: vault,
      storePath: store,
    });

    const result = await runVaultLint({ config });

    const ids = new Set(result.violations.map((v) => v.ruleId));
    expect(ids.has("fm/required")).toBe(true);
    expect(ids.has("fm/updated-format")).toBe(true);
    expect(ids.has("link/broken")).toBe(true);

    expect(result.proposalsPath).not.toBeNull();
    const md = fs.readFileSync(result.proposalsPath!, "utf-8");
    expect(md).toContain("Vault Lint Proposals");
    expect(md).toContain("fm/required");

    const statsPath = path.join(path.dirname(result.proposalsPath!), "stats.json");
    const stats = JSON.parse(fs.readFileSync(statsPath, "utf-8"));
    expect(stats.scanned).toBe(4);
  });

  it("incremental run reports zero changed when content unchanged", async () => {
    write(
      "A.md",
      `---\nsummary: x\ntags: [t]\nupdated: 2026-04-24\n---\n\n# A`
    );
    const config = await loadVaultLintConfig("/nonexistent.yaml", {
      vaultRoot: vault,
      storePath: store,
    });

    const first = await runVaultLint({ config, dryRun: true });
    expect(first.stats.changed).toBe(1);

    const second = await runVaultLint({ config, dryRun: true });
    expect(second.stats.changed).toBe(0);
  });

  it("respects ignore patterns", async () => {
    write(
      "Keep.md",
      `---\nsummary: x\ntags: [t]\nupdated: 2026-04-24\n---\n\n# Keep`
    );
    write(
      "Templates/Skip.md",
      `---\nsummary: x\ntags: [t]\nupdated: 2026-04-24\n---\n\n# Skip`
    );

    const config = await loadVaultLintConfig("/nonexistent.yaml", {
      vaultRoot: vault,
      storePath: store,
      ignore: ["Templates/**"],
    });
    const result = await runVaultLint({ config, dryRun: true });
    expect(result.stats.scanned).toBe(1);
  });

  it("--only filters rules", async () => {
    write("X.md", "# Y\n\nbody");
    const config = await loadVaultLintConfig("/nonexistent.yaml", {
      vaultRoot: vault,
      storePath: store,
    });
    const result = await runVaultLint({
      config,
      dryRun: true,
      only: ["note/h1-mismatch"],
    });
    expect(result.violations.every((v) => v.ruleId === "note/h1-mismatch")).toBe(true);
  });
});
