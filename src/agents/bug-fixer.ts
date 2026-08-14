import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

import { createLogger } from "../core/logger.js";
import type { FixResponse, IProvider } from "../providers/base.js";

const logger = createLogger("agent-bug-fixer");

async function collectSource(directory: string, root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !["node_modules", "dist", ".git"].includes(entry.name)) {
      Object.assign(files, await collectSource(path, root));
    }
    else if ([".ts", ".css", ".html"].includes(extname(entry.name))) {
      files[relative(root, path)] = (await readFile(path, "utf8")).slice(0, 200_000);
    }
  }
  return files;
}

function resolvePatchTarget(projectPath: string, requestedPath: string): string {
  const root = resolve(projectPath);
  const target = resolve(root, requestedPath);
  if (target === root || !target.startsWith(`${root}/`)) throw new Error(`BugFixer patch escaped project: ${requestedPath}`);
  if (target.includes(`${join(root, "node_modules")}/`) || target.includes(`${join(root, "dist")}/`)) {
    throw new Error(`BugFixer cannot patch generated dependencies or build output: ${requestedPath}`);
  }
  return target;
}

export class BugFixer {
  public constructor(private readonly provider: IProvider) {}

  public async fix(projectPathInput: string, issues: string[], consoleErrors: string[]): Promise<FixResponse> {
    const projectPath = resolve(projectPathInput);
    logger.info("Fixing game bugs", { projectPath, issues, consoleErrorCount: consoleErrors.length });
    const files = await collectSource(projectPath, projectPath);
    const combinedCode = Object.entries(files).map(([path, content]) => `// FILE: ${path}\n${content}`).join("\n\n");
    const errors = [...issues, ...consoleErrors.map((error) => `Console: ${error}`)];
    const response = await this.provider.fixBug(combinedCode, errors.join("\n"), {
      projectPath,
      role: "BugFixer",
      files,
      metadata: { issueCount: issues.length, consoleErrorCount: consoleErrors.length },
    });
    if (response.patches.length === 0) throw new Error("BugFixer returned no patches");
    for (const patch of response.patches) {
      const target = resolvePatchTarget(projectPath, patch.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, patch.content, "utf8");
      logger.debug("Bug fix patch applied", { file: relative(projectPath, target), bytes: patch.content.length });
    }
    logger.info("Game bugs fixed", { projectPath, summary: response.summary, patchCount: response.patches.length });
    return response;
  }
}
