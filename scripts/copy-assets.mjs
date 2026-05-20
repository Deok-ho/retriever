#!/usr/bin/env node
// Copies non-TS assets (yaml/json) from src/ to dist/ after `tsc`.
import { cpSync, mkdirSync, existsSync } from "node:fs";

const assets = [
  ["src/sessions/redact-patterns.yaml", "dist/sessions/redact-patterns.yaml"],
];

for (const [from, to] of assets) {
  if (!existsSync(from)) {
    console.error(`copy-assets: missing source ${from}`);
    process.exitCode = 1;
    continue;
  }
  mkdirSync(to.replace(/\/[^/]+$/, ""), { recursive: true });
  cpSync(from, to);
  console.log(`copy-assets: ${from} -> ${to}`);
}
