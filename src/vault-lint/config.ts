import * as fs from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";
import type { Severity, VaultLintConfig } from "./types.js";

const DEFAULT_RULES: VaultLintConfig["rules"] = {
  "fm/required": { enabled: true, severity: "error" },
  "fm/tags-array": { enabled: true, severity: "error", autoApply: true },
  "fm/updated-format": { enabled: true, severity: "warn", autoApply: true },
  "link/broken": { enabled: true, severity: "warn" },
  "note/orphan": { enabled: true, severity: "info" },
  "note/h1-mismatch": { enabled: true, severity: "info" },
};

const DEFAULT_IGNORE = [
  "91_Retriever-Store/**",
  "Templates/**",
  ".trash/**",
  ".obsidian/**",
];

export async function loadVaultLintConfig(
  configPath: string,
  overrides?: Partial<VaultLintConfig>
): Promise<VaultLintConfig> {
  let raw: Record<string, unknown> = {};
  try {
    const text = await fs.readFile(configPath, "utf-8");
    const loaded = yaml.load(text);
    if (loaded && typeof loaded === "object") {
      raw = loaded as Record<string, unknown>;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const vaultRoot = String(
    overrides?.vaultRoot ?? raw.vault_root ?? raw.vaultRoot ?? ""
  );
  if (!vaultRoot) {
    throw new Error(
      "vault-lint config: vault_root is required (set in config.yaml or pass --vault)"
    );
  }

  const storePath = String(
    overrides?.storePath ??
      raw.store_path ??
      raw.storePath ??
      path.join(vaultRoot, "91_Retriever-Store", "vault-lint")
  );

  const ignore = (overrides?.ignore ??
    (raw.ignore as string[]) ??
    DEFAULT_IGNORE) as string[];

  const rules = mergeRules(raw.rules, overrides?.rules);

  const autoApply = {
    enabled: Boolean(
      overrides?.autoApply?.enabled ??
        (raw.auto_apply as Record<string, unknown> | undefined)?.enabled ??
        false
    ),
  };

  return { vaultRoot, storePath, ignore, rules, autoApply };
}

function mergeRules(
  raw: unknown,
  overrides: VaultLintConfig["rules"] | undefined
): VaultLintConfig["rules"] {
  const merged: VaultLintConfig["rules"] = { ...DEFAULT_RULES };
  if (raw && typeof raw === "object") {
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!(id in merged)) merged[id] = { enabled: true };
      const cfg = merged[id];
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        if ("enabled" in v) cfg.enabled = Boolean(v.enabled);
        if ("severity" in v) cfg.severity = v.severity as Severity;
        if ("auto_apply" in v) cfg.autoApply = Boolean(v.auto_apply);
        if ("autoApply" in v) cfg.autoApply = Boolean(v.autoApply);
      }
    }
  }
  if (overrides) {
    for (const [id, value] of Object.entries(overrides)) {
      merged[id] = { ...merged[id], ...value };
    }
  }
  return merged;
}
