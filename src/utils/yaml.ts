import * as fs from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";

export async function readYaml<T = unknown>(
  filePath: string
): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return yaml.load(content) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeYaml(
  filePath: string,
  data: unknown
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = yaml.dump(data, {
    noCompatMode: true,
    lineWidth: -1,
  });
  await fs.writeFile(filePath, content, "utf-8");
}
