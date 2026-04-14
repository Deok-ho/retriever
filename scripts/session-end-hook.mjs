#!/usr/bin/env node
/**
 * SessionEnd hook — 세션 교훈을 볼트 Memory Hub에 직접 저장
 *
 * stdin으로 hook context (JSON)를 받음
 * 환경변수: RTV_STORE_PATH, ANTHROPIC_API_KEY
 */
import * as fs from "node:fs";
import * as path from "node:path";

const STORE = process.env.RTV_STORE_PATH;
if (!STORE) process.exit(0);

// Read hook input from stdin
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
const sessionId = context.sessionId || "unknown";

// Find project name by matching cwd against snapshot.yaml paths
let projectName = null;
const device = process.env.RTV_DEVICE_NAME || "unknown";
const devicesDir = path.join(STORE, "devices", device);
try {
  for (const dir of fs.readdirSync(devicesDir)) {
    const snapshotPath = path.join(devicesDir, dir, "snapshot.yaml");
    if (fs.existsSync(snapshotPath)) {
      const content = fs.readFileSync(snapshotPath, "utf-8");
      // Match repo.path in snapshot against cwd
      const cwdNorm = path.resolve(cwd).toLowerCase();
      if (content.toLowerCase().includes(cwdNorm.replace(/\\/g, "/"))) {
        projectName = dir;
        break;
      }
    }
  }
} catch {}

if (!projectName) {
  // Fallback: derive from cwd basename
  projectName = path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

// Read the session transcript (last few messages)
const claudeProjectId = path.resolve(cwd)
  .replace(/:/g, "-")
  .split(path.sep)
  .join("-");
const claudeProjectsDir = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".claude",
  "projects"
);

// Find matching project dir (case-insensitive)
let claudeDir = null;
try {
  const dirs = fs.readdirSync(claudeProjectsDir);
  const match = dirs.find(
    (d) => d.toLowerCase() === claudeProjectId.toLowerCase()
  );
  if (match) claudeDir = path.join(claudeProjectsDir, match);
} catch {}

if (!claudeDir) process.exit(0);

// Find the session jsonl
const jsonlPath = path.join(claudeDir, `${sessionId}.jsonl`);
if (!fs.existsSync(jsonlPath)) process.exit(0);

// Extract last N lines for summary context
const content = fs.readFileSync(jsonlPath, "utf-8");
const lines = content.trim().split("\n");

// Extract first user message (goal) and recent assistant messages
let firstGoal = "";
const errors = [];
const filesChanged = new Set();
let messageCount = 0;

for (const line of lines) {
  try {
    const entry = JSON.parse(line);
    if (entry.type === "user" || entry.message?.role === "user") {
      messageCount++;
      if (!firstGoal && typeof entry.message?.content === "string") {
        firstGoal = entry.message.content.substring(0, 500);
      }
    }
    // Collect errors
    if (entry.type === "tool_result" || entry.type === "assistant") {
      const text = JSON.stringify(entry).toLowerCase();
      if (text.includes("error") || text.includes("fail")) {
        const snippet = JSON.stringify(entry).substring(0, 200);
        if (errors.length < 5) errors.push(snippet);
      }
    }
  } catch {}
}

// Only save if session was non-trivial (>3 messages)
if (messageCount < 3) process.exit(0);

// Write session summary to store
const date = new Date().toISOString().split("T")[0];
const memDir = path.join(STORE, "desired-state", projectName, "memory");
fs.mkdirSync(memDir, { recursive: true });

const summaryName = `session-${date}-${sessionId.substring(0, 8)}`;
const summaryContent = `---
name: ${summaryName}
description: "세션 요약 (${date}, ${messageCount} messages)"
type: project
---

## 목표
${firstGoal || "(추출 실패)"}

## 세션 정보
- 날짜: ${date}
- 메시지 수: ${messageCount}
- 세션 ID: ${sessionId}
- 프로젝트: ${projectName}
${errors.length > 0 ? `\n## 에러/실패\n${errors.map((e) => "- " + e).join("\n")}\n` : ""}
`;

fs.writeFileSync(
  path.join(memDir, `${summaryName}.md`),
  summaryContent,
  "utf-8"
);
