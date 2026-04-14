#!/usr/bin/env node
/**
 * SessionStart hook — 하네스 상태 점검 후 결과를 stdout으로 출력
 * Claude Code가 세션 시작 시 이 결과를 컨텍스트로 받음
 *
 * stdin: hook context JSON (cwd, sessionId)
 * stdout: 점검 결과 (diff report)
 * env: RTV_STORE_PATH, RTV_DEVICE_NAME
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const STORE = process.env.RTV_STORE_PATH;
const DEVICE = process.env.RTV_DEVICE_NAME || "unknown";
if (!STORE) process.exit(0);

// Read hook input
let input = "";
process.stdin.setEncoding("utf-8");
for await (const chunk of process.stdin) input += chunk;

let context;
try {
  context = JSON.parse(input);
} catch {
  process.exit(0);
}

const cwd = context.cwd || process.cwd();

// Find project by matching cwd against snapshots
let projectName = null;
const devicesDir = path.join(STORE, "devices", DEVICE);
try {
  for (const dir of fs.readdirSync(devicesDir)) {
    const snapshotPath = path.join(devicesDir, dir, "snapshot.yaml");
    if (fs.existsSync(snapshotPath)) {
      const content = fs.readFileSync(snapshotPath, "utf-8");
      const cwdNorm = path.resolve(cwd).toLowerCase().replace(/\\/g, "/");
      if (content.toLowerCase().includes(cwdNorm)) {
        projectName = dir;
        break;
      }
    }
  }
} catch {}

if (!projectName) {
  // Not a registered project — skip silently
  process.exit(0);
}

// Run rtv_status via the built dist
const distIndex = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
  "..",
  "dist",
  "tools",
  "status.js"
);

try {
  // Dynamic import the status handler
  const { handleStatus } = await import(`file://${distIndex.replace(/\\/g, "/")}`);
  const config = { storePath: STORE, deviceName: DEVICE };
  const result = await handleStatus({ project: projectName, path: cwd }, config);

  // Output to stdout — Claude Code will see this as hook context
  const report = result.report;
  const issues = report.items.filter(
    (i) => i.status === "mismatch" || i.status === "missing"
  );

  if (issues.length === 0) {
    console.log(`[Retriever] ✓ ${projectName}@${DEVICE} — 모든 항목 동기화됨`);
  } else {
    console.log(`[Retriever] ${projectName}@${DEVICE}`);
    for (const item of issues) {
      const icon = item.status === "mismatch" ? "⚠" : "✗";
      console.log(`  ${icon} ${item.message}`);
    }
    console.log(`  → rtv_apply로 반영하세요`);
  }
} catch (err) {
  // Silently fail — don't block session start
  process.exit(0);
}
