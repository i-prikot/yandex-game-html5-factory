import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, join, relative, resolve } from "node:path";

import { createLogger } from "../core/logger.js";
import { runProcess, type ProcessRunner } from "../providers/process-runner.js";

export type ScaffoldGameType = "2d" | "3d";
export type ScaffoldQuality = "LOW" | "MEDIUM" | "HIGH";

export interface ScaffoldOptions {
  title: string;
  type: ScaffoldGameType;
  quality: ScaffoldQuality;
  genre?: string;
  projectsRoot?: string;
  installDependencies?: boolean;
}

interface ScaffoldGeneratorOptions {
  templatesRoot?: string;
  runner?: ProcessRunner;
}

function toSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
  return slug || `game-${createHash("sha256").update(value).digest("hex").slice(0, 10)}`;
}

function escapedText(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function escapedHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
  }));
  return nested.flat();
}

export class ScaffoldGenerator {
  private readonly logger = createLogger("scaffold-generator");
  private readonly templatesRoot: string;
  private readonly runner: ProcessRunner;

  public constructor(options: ScaffoldGeneratorOptions = {}) {
    this.templatesRoot = options.templatesRoot ?? join(process.cwd(), "templates");
    this.runner = options.runner ?? runProcess;
  }

  public async scaffold(options: ScaffoldOptions): Promise<string> {
    const slug = toSlug(options.title);
    const projectsRoot = resolve(options.projectsRoot ?? process.env.FACTORY_PROJECTS_DIR ?? "projects");
    const projectPath = resolve(projectsRoot, slug);
    if (!projectPath.startsWith(`${projectsRoot}/`)) throw new Error("Generated project path escaped projects root");
    this.logger.info("Scaffolding project", { title: options.title, slug, type: options.type, projectPath });

    await mkdir(projectsRoot, { recursive: true });
    try {
      const existing = await stat(projectPath);
      if (existing.isDirectory()) throw new Error(`Project already exists: ${projectPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    if (options.type === "3d") {
      await this.copyTemplate(join(this.templatesRoot, "babylon-base"), projectPath);
      await this.copyTemplate(join(this.templatesRoot, "3d"), projectPath);
    } else {
      await this.copyTemplate(join(this.templatesRoot, "2d"), projectPath);
      await cp(
        join(this.templatesRoot, "babylon-base", "src", "yandex", "adapter.ts"),
        join(projectPath, "src", "yandex", "adapter.ts"),
      );
    }

    await this.replacePlaceholders(projectPath, {
      GAME_TITLE: options.title,
      GAME_SLUG: slug,
      GAME_QUALITY: options.quality,
      GAME_GENRE: options.genre ?? (options.type === "2d" ? "arcade" : "endless-runner"),
    });

    if (options.installDependencies !== false) {
      this.logger.info("Installing generated project dependencies", { projectPath });
      const result = await this.runner("npm", ["install", "--include=dev"], {
        cwd: projectPath,
        timeoutMs: 600_000,
      });
      if (result.exitCode !== 0) {
        this.logger.warn("Generated project npm install failed", {
          projectPath,
          exitCode: result.exitCode,
          stderr: result.stderr.slice(-1_000),
        });
        throw new Error(`npm install failed for ${slug}`);
      }
    }

    this.logger.info("Project scaffold completed", { projectPath });
    return projectPath;
  }

  private async copyTemplate(source: string, destination: string): Promise<void> {
    await cp(source, destination, {
      recursive: true,
      force: true,
      filter: (path) => !path.split(/[\\/]/u).some((part) => part === "node_modules" || part === "dist"),
    });
    this.logger.debug("Template copied", { source, destination });
  }

  private async replacePlaceholders(projectPath: string, values: Readonly<Record<string, string>>): Promise<void> {
    const textExtensions = new Set([".html", ".json", ".ts", ".css", ".md"]);
    for (const filePath of await listFiles(projectPath)) {
      if (!textExtensions.has(extname(filePath))) continue;
      let content = await readFile(filePath, "utf8");
      const isHtml = extname(filePath) === ".html";
      for (const [key, rawValue] of Object.entries(values)) {
        const value = isHtml ? escapedHtml(rawValue) : escapedText(rawValue);
        content = content.replaceAll(`{{${key}}}`, value);
      }
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
      this.logger.debug("Template placeholders replaced", { file: relative(projectPath, filePath) });
    }
  }
}

export { toSlug as createGameSlug };
