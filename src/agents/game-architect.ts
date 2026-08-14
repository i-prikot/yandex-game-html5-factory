import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createLogger } from "../core/logger.js";
import { QUALITY_PRESETS } from "../performance/budgets.js";
import { applyBudget } from "../performance/injector.js";
import { ScaffoldGenerator } from "../scaffold/generator.js";
import type { GamePlan } from "./game-planner.js";

export interface GameArchitectOptions {
  projectsRoot?: string;
  installDependencies?: boolean;
}

const logger = createLogger("agent-game-architect");

export class GameArchitect {
  public constructor(
    private readonly generator: Pick<ScaffoldGenerator, "scaffold"> = new ScaffoldGenerator(),
    private readonly options: GameArchitectOptions = {},
  ) {}

  public async scaffold(plan: GamePlan): Promise<string> {
    logger.info("Scaffolding game architecture", {
      title: plan.title,
      type: plan.type,
      genre: plan.genre,
      quality: plan.quality,
    });
    const scaffoldOptions = {
      title: plan.title,
      type: plan.type,
      quality: plan.quality,
      genre: plan.genre,
      ...(this.options.projectsRoot ? { projectsRoot: this.options.projectsRoot } : {}),
      ...(this.options.installDependencies !== undefined
        ? { installDependencies: this.options.installDependencies }
        : {}),
    };
    const projectPath = await this.generator.scaffold(scaffoldOptions);
    if (plan.type === "3d") {
      const entryPath = join(projectPath, "src", "main.ts");
      const entryCode = await readFile(entryPath, "utf8");
      await writeFile(entryPath, applyBudget(entryCode, plan.quality), "utf8");
      logger.debug("Babylon performance budget applied", { entryPath, quality: plan.quality });
    }
    const metadataDirectory = join(projectPath, ".factory");
    await mkdir(metadataDirectory, { recursive: true });
    await Promise.all([
      writeFile(join(metadataDirectory, "game-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8"),
      writeFile(
        join(metadataDirectory, "performance-budget.json"),
        `${JSON.stringify({ preset: plan.quality, ...QUALITY_PRESETS[plan.quality] }, null, 2)}\n`,
        "utf8",
      ),
    ]);
    logger.info("Game architecture scaffolded", { projectPath });
    return projectPath;
  }
}
