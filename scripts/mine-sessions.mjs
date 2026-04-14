#!/usr/bin/env node
/**
 * Session Mining — Phase A: 모든 세션에서 경량 인덱스 추출
 *
 * 사용법:
 *   node scripts/mine-sessions.mjs                     # 전체 실행
 *   node scripts/mine-sessions.mjs --project retriever  # 특정 프로젝트만
 *   node scripts/mine-sessions.mjs --ollama             # Phase B: Ollama로 패턴 추출
 *
 * env: RTV_STORE_PATH, RTV_DEVICE_NAME
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const STORE = process.env.RTV_STORE_PATH || "C:/MyArchive/MyArchive/91_Retriever-Store";
const DEVICE = process.env.RTV_DEVICE_NAME || "ASUS_WIN01";
const args = process.argv.slice(2);
const targetProject = args.includes("--project") ? args[args.indexOf("--project") + 1] : null;
const useOllama = args.includes("--ollama");

const claudeProjects = path.join(os.homedir(), ".claude", "projects");

// Load project mapping
const mapPath = path.join(STORE, "devices", DEVICE, "claude-projects-map.yaml");
let mapping = {};
if (fs.existsSync(mapPath)) {
  const content = fs.readFileSync(mapPath, "utf-8");
  // Simple YAML parsing for flat structure
  let currentKey = null;
  for (const line of content.split("\n")) {
    if (!line.startsWith(" ") && line.endsWith(":")) {
      currentKey = line.slice(0, -1);
      mapping[currentKey] = {};
    } else if (currentKey && line.trim().startsWith("cwd:")) {
      mapping[currentKey].cwd = line.trim().replace("cwd: ", "").replace(/'/g, "");
    }
  }
}

// Reverse map: Retriever project name → claude project IDs
const rtvToClaudeMap = {};
const devicesDir = path.join(STORE, "devices", DEVICE);
try {
  for (const rtvName of fs.readdirSync(devicesDir)) {
    const snapshotPath = path.join(devicesDir, rtvName, "snapshot.yaml");
    if (!fs.existsSync(snapshotPath)) continue;
    const snapContent = fs.readFileSync(snapshotPath, "utf-8");

    // Find matching claude project dirs
    for (const [claudeId, info] of Object.entries(mapping)) {
      if (!info.cwd) continue;
      const cwdNorm = info.cwd.replace(/\/\//g, "/").toLowerCase();
      if (snapContent.toLowerCase().includes(cwdNorm)) {
        if (!rtvToClaudeMap[rtvName]) rtvToClaudeMap[rtvName] = [];
        rtvToClaudeMap[rtvName].push(claudeId);
      }
    }
  }
} catch {}

// Phase A: Extract lightweight index from each session
function extractSessionIndex(jsonlPath) {
  const content = fs.readFileSync(jsonlPath, "utf-8");
  const lines = content.trim().split("\n");

  let firstGoal = "";
  let lastAssistant = "";
  const errors = [];
  const filesChanged = new Set();
  let messageCount = 0;
  let startTime = null;
  let endTime = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const timestamp = entry.timestamp;
      if (timestamp) {
        if (!startTime) startTime = timestamp;
        endTime = timestamp;
      }

      // User messages
      if (entry.message?.role === "user") {
        messageCount++;
        if (!firstGoal && typeof entry.message.content === "string") {
          firstGoal = entry.message.content.substring(0, 300);
        }
      }

      // Assistant messages — keep last one's text summary
      if (entry.message?.role === "assistant" && Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === "text" && block.text) {
            lastAssistant = block.text.substring(0, 300);
          }
          // Track tool use for file changes
          if (block.type === "tool_use") {
            const input = block.input;
            if (input?.file_path) filesChanged.add(input.file_path);
            if (input?.command) {
              // Extract file paths from git add/commit commands
              const match = input.command.match(/git (?:add|commit).*?([^\s]+\.[a-z]+)/g);
              if (match) match.forEach((m) => filesChanged.add(m));
            }
          }
        }
      }

      // Errors
      if (entry.message?.role === "tool") {
        const text = JSON.stringify(entry.message.content || "");
        if (text.includes("error") || text.includes("FAIL") || text.includes("Error")) {
          if (errors.length < 10) {
            const snippet = text.substring(0, 150).replace(/"/g, "");
            if (!errors.includes(snippet)) errors.push(snippet);
          }
        }
      }
    } catch {}
  }

  return {
    first_goal: firstGoal,
    last_result: lastAssistant,
    message_count: messageCount,
    files_changed: [...filesChanged].slice(0, 30),
    errors: errors.slice(0, 5),
    start_time: startTime,
    end_time: endTime,
    duration_min: startTime && endTime
      ? Math.round((new Date(endTime) - new Date(startTime)) / 60000)
      : 0,
  };
}

// Main
console.log("=== Session Mining Phase A ===\n");

let totalSessions = 0;
let totalIndexed = 0;

const projectsToProcess = targetProject ? [targetProject] : (() => {
  try { return fs.readdirSync(devicesDir).filter(d => {
    return fs.statSync(path.join(devicesDir, d)).isDirectory() && d !== "." && d !== "..";
  }); } catch { return []; }
})();

for (const rtvName of projectsToProcess) {
  const claudeIds = rtvToClaudeMap[rtvName];
  if (!claudeIds || claudeIds.length === 0) continue;

  const indexDir = path.join(devicesDir, rtvName, "sessions");
  fs.mkdirSync(indexDir, { recursive: true });

  const allIndices = [];

  for (const claudeId of claudeIds) {
    const claudeDir = path.join(claudeProjects, claudeId);
    if (!fs.existsSync(claudeDir)) continue;

    const jsonls = fs.readdirSync(claudeDir).filter((f) => f.endsWith(".jsonl"));
    totalSessions += jsonls.length;

    for (const jsonl of jsonls) {
      const sessionId = jsonl.replace(".jsonl", "");
      const jsonlPath = path.join(claudeDir, jsonl);
      const stat = fs.statSync(jsonlPath);

      // Skip tiny sessions (<1KB)
      if (stat.size < 1024) continue;

      try {
        const index = extractSessionIndex(jsonlPath);
        if (index.message_count < 2) continue;

        allIndices.push({
          session_id: sessionId,
          size_kb: Math.round(stat.size / 1024),
          ...index,
        });
        totalIndexed++;
      } catch (err) {
        console.error(`  ✗ ${sessionId}: ${err.message}`);
      }
    }
  }

  // Sort by time descending
  allIndices.sort((a, b) => (b.start_time || "").localeCompare(a.start_time || ""));

  // Save detailed index
  fs.writeFileSync(
    path.join(indexDir, "index-detailed.json"),
    JSON.stringify(allIndices, null, 2),
    "utf-8"
  );

  console.log(`✓ ${rtvName}: ${allIndices.length} sessions indexed`);
}

console.log(`\n총 ${totalSessions} 세션 스캔, ${totalIndexed} 인덱싱 완료`);
console.log(`저장: devices/${DEVICE}/{project}/sessions/index-detailed.json`);

// Phase B: Ollama pattern extraction
if (useOllama) {
  console.log("\n=== Session Mining Phase B (Ollama) ===\n");

  const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

  for (const rtvName of projectsToProcess) {
    const indexPath = path.join(devicesDir, rtvName, "sessions", "index-detailed.json");
    if (!fs.existsSync(indexPath)) continue;

    const indices = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    if (indices.length === 0) continue;

    // Prepare summary for LLM
    const sessionSummaries = indices.slice(0, 50).map((s) => {
      return `[${s.start_time?.substring(0, 10) || "?"} | ${s.message_count}msg | ${s.duration_min}min]
Goal: ${s.first_goal?.substring(0, 150) || "?"}
Result: ${s.last_result?.substring(0, 150) || "?"}
${s.errors.length > 0 ? "Errors: " + s.errors.join("; ").substring(0, 200) : ""}`;
    }).join("\n---\n");

    const prompt = `다음은 "${rtvName}" 프로젝트의 최근 세션 요약들이다.

${sessionSummaries}

위 세션들에서 반복되는 패턴을 분석해줘:
1. 반복되는 실수나 에러 (같은 유형의 문제가 여러 번 발생)
2. 효과적이었던 접근법
3. 프로젝트의 핵심 병목

각 패턴을 다음 형식으로 출력해줘 (한국어):
---
name: pattern-name-in-english
type: feedback 또는 project
description: 한 줄 설명
---
상세 내용 (2-3문장)

교훈이 없으면 "없음"만 출력.`;

    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || "gemma3",
          prompt,
          stream: false,
          options: { temperature: 0.3 },
        }),
      });

      if (!response.ok) {
        console.error(`  ✗ ${rtvName}: Ollama error ${response.status}`);
        continue;
      }

      const data = await response.json();
      const result = data.response || "";

      if (result.trim() === "없음" || result.trim().length < 20) {
        console.log(`⊘ ${rtvName}: 추출할 패턴 없음`);
        continue;
      }

      // Parse and save each pattern as memory
      const patterns = result.split("\n---\n").filter((p) => p.includes("name:"));
      let saved = 0;

      for (const pattern of patterns) {
        const nameMatch = pattern.match(/name:\s*(.+)/);
        const typeMatch = pattern.match(/type:\s*(.+)/);
        const descMatch = pattern.match(/description:\s*(.+)/);

        if (!nameMatch) continue;

        const name = nameMatch[1].trim();
        const type = (typeMatch?.[1]?.trim() || "feedback");
        const desc = descMatch?.[1]?.trim() || name;

        // Extract body (everything after the frontmatter block)
        const bodyStart = pattern.lastIndexOf("---");
        const body = bodyStart > 0 ? pattern.substring(bodyStart + 3).trim() : pattern;

        const memContent = `---
name: ${name}
description: "${desc}"
type: ${type}
---

${body}
`;
        const memDir = path.join(STORE, "desired-state", rtvName, "memory");
        fs.mkdirSync(memDir, { recursive: true });
        fs.writeFileSync(path.join(memDir, `${name}.md`), memContent, "utf-8");
        saved++;
      }

      console.log(`✓ ${rtvName}: ${saved} 패턴 추출 → memory/ 저장`);
    } catch (err) {
      console.error(`  ✗ ${rtvName}: ${err.message}`);
    }
  }
}
