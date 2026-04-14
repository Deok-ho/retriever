import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RepoState } from "../types.js";

const exec = promisify(execFile);

async function git(
  cwd: string,
  args: string[]
): Promise<string | null> {
  try {
    const { stdout } = await exec("git", args, { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function getRepoState(
  projectPath: string
): Promise<RepoState | null> {
  const branch = await git(projectPath, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  if (branch === null) return null;

  const lastCommitRaw = await git(projectPath, [
    "log",
    "-1",
    "--format=%h - %s",
  ]);

  const statusRaw = await git(projectPath, [
    "status",
    "--porcelain",
  ]);
  const uncommittedFiles = statusRaw
    ? statusRaw.split("\n").filter((l) => l.trim()).length
    : 0;

  const remote =
    (await git(projectPath, ["remote", "get-url", "origin"])) ?? "";

  let remoteSync = "";
  const ahead = await git(projectPath, [
    "rev-list",
    "--count",
    "@{upstream}..HEAD",
  ]);
  const behind = await git(projectPath, [
    "rev-list",
    "--count",
    "HEAD..@{upstream}",
  ]);
  if (ahead !== null && behind !== null) {
    const parts: string[] = [];
    if (Number(ahead) > 0) parts.push(`${ahead} ahead`);
    if (Number(behind) > 0) parts.push(`${behind} behind`);
    remoteSync = parts.join(", ") || "up to date";
  }

  return {
    path: projectPath,
    branch,
    last_commit: lastCommitRaw ?? "",
    dirty: uncommittedFiles > 0,
    uncommitted_files: uncommittedFiles,
    remote,
    remote_sync: remoteSync,
  };
}
