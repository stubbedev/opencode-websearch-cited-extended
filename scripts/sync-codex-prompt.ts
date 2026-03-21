import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, "..");
const sourcePath = resolve(repoRoot, "../opencode/packages/opencode/src/session/prompt/codex.txt");
const targetPath = resolve(repoRoot, "src/codex_prompt.txt");

const prompt = await readFile(sourcePath, "utf8");

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, prompt, "utf8");
