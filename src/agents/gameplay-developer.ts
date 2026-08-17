import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { createLogger } from "../core/logger.js";
import type { IProvider } from "../providers/base.js";
import type { GamePlan } from "./game-planner.js";

export interface GameplayDevelopmentResult {
  files: string[];
  explanation: string;
}

const logger = createLogger("agent-gameplay-developer");

function safeSourcePath(projectPath: string, requestedPath: string): string {
  const projectRoot = resolve(projectPath);
  const sourceRoot = resolve(projectRoot, "src");
  const target = resolve(projectRoot, requestedPath);
  if (!target.startsWith(`${sourceRoot}/`) || !/\.(?:ts|css)$/u.test(target)) {
    throw new Error(`Gameplay file must be a TypeScript or CSS file inside src/: ${requestedPath}`);
  }
  return target;
}

export class GameplayDeveloper {
  public constructor(private readonly provider: IProvider) {}

  public async writeCode(plan: GamePlan, projectPathInput: string): Promise<GameplayDevelopmentResult> {
    const projectPath = resolve(projectPathInput);
    const targetModule = plan.type === "2d" ? "src/game2d.ts" : "src/game3d.ts";
    const currentCode = await readFile(resolve(projectPath, targetModule), "utf8");
    logger.info("Generating gameplay code", {
      projectPath,
      type: plan.type,
      genre: plan.genre,
      mechanics: plan.mechanics,
      targetModule,
    });
    const response = await this.provider.generateCode(
      [
        `Implement the ${plan.type.toUpperCase()} ${plan.genre} game described below.`,
        plan.description,
        `Mechanics: ${plan.mechanics.join(", ")}. Quality: ${plan.quality}.`,
        `Return complete replacement TypeScript for ${targetModule}; preserve its exported public contract.`,
        "Use no external runtime service, never include API keys, and stay within the performance budget.",
        `Current module:\n${currentCode}`,
      ].join("\n\n"),
      {
        projectPath,
        role: "GameplayDeveloper",
        gameBrief: plan.description,
        files: { [targetModule]: currentCode },
        metadata: { type: plan.type, genre: plan.genre, quality: plan.quality },
      },
    );
    const populatedFiles = response.files.filter((file) => file.content.trim().length > 0);
    const replacements = populatedFiles.length > 0
      ? populatedFiles
      : response.code.trim().length > 0
        ? [{ path: targetModule, content: response.code }]
        : [];
    if (response.files.length > populatedFiles.length) {
      logger.debug("Ignored empty gameplay file replacements", {
        ignoredFiles: response.files.length - populatedFiles.length,
        usableFiles: populatedFiles.length,
        usedCodeFallback: populatedFiles.length === 0 && replacements.length > 0,
      });
    }
    if (replacements.length === 0) {
      throw new Error("GameplayDeveloper returned no source code");
    }
    const written: string[] = [];
    for (const replacement of replacements) {
      if (!replacement.content.trim()) continue;
      const target = safeSourcePath(projectPath, replacement.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, replacement.content, "utf8");
      written.push(relative(projectPath, target));
      logger.debug("Gameplay module written", {
        file: relative(projectPath, target),
        bytes: replacement.content.length,
      });
    }
    const manifestPath = resolve(projectPath, ".factory", "gameplay-generation.json");
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      `${JSON.stringify({ provider: this.provider.kind, files: written, explanation: response.explanation }, null, 2)}\n`,
      "utf8",
    );
    logger.info("Gameplay code generated", { projectPath, files: written, provider: this.provider.kind });
    return { files: written, explanation: response.explanation };
  }
}
