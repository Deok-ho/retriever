import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";

export async function hashFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

interface HashDirResult {
  hash: string;
  count: number;
}

export async function hashDir(
  dirPath: string,
  opts?: { returnCount: boolean }
): Promise<HashDirResult> {
  try {
    const entries = await fs.readdir(dirPath, { recursive: true });
    const files = (
      await Promise.all(
        entries.map(async (entry) => {
          const full = path.join(dirPath, entry.toString());
          const stat = await fs.stat(full);
          return stat.isFile() ? full : null;
        })
      )
    )
      .filter(Boolean)
      .sort() as string[];

    const combined = createHash("sha256");
    for (const file of files) {
      const relPath = path.relative(dirPath, file);
      const content = await fs.readFile(file);
      combined.update(relPath).update(content);
    }

    return { hash: combined.digest("hex"), count: files.length };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { hash: "", count: 0 };
    }
    throw err;
  }
}
