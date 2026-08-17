import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createLogger } from "../core/logger.js";
import type { IProvider } from "../providers/base.js";
import type { GamePlan } from "./game-planner.js";
import { resolveGameplayPhases } from "./gameplay-phases.js";
import {
  PhaseOrchestrator,
  type PhaseExecutionResult,
  type PhaseTiming,
} from "./phase-orchestrator.js";

export interface GameplayDevelopmentResult {
  files: string[];
  explanation: string;
  phaseTimings: PhaseTiming[];
}

const logger = createLogger("agent-gameplay-developer");

export class GameplayDeveloper {
  public constructor(
    private readonly provider: IProvider,
    private readonly phaseOrchestrator: Pick<PhaseOrchestrator, "executePhases"> = new PhaseOrchestrator(),
  ) {}

  public async writeCode(plan: GamePlan, projectPathInput: string): Promise<GameplayDevelopmentResult> {
    const projectPath = resolve(projectPathInput);
    const targetModule = plan.type === "2d" ? "src/game2d.ts" : "src/game3d.ts";
    const phases = resolveGameplayPhases(plan.type);
    logger.info("Generating gameplay code in phases", {
      projectPath,
      type: plan.type,
      genre: plan.genre,
      mechanics: plan.mechanics,
      targetModule,
      phaseCount: phases.length,
    });
    const result = await this.phaseOrchestrator.executePhases(phases, plan, projectPath, this.provider);
    const written = [result.targetModule];
    const manifestPath = resolve(projectPath, ".factory", "gameplay-generation.json");
    const phaseManifestPath = resolve(projectPath, ".factory", "gameplay-phases.json");
    await mkdir(dirname(manifestPath), { recursive: true });
    const explanation = result.explanations.filter(Boolean).join("\n");
    await Promise.all([
      writeFile(
        manifestPath,
        `${JSON.stringify({ provider: this.provider.kind, files: written, explanation }, null, 2)}\n`,
        "utf8",
      ),
      this.writePhaseManifest(phaseManifestPath, result),
    ]);
    logger.info("Gameplay code generated", {
      projectPath,
      files: written,
      provider: this.provider.kind,
      completedPhases: result.completedPhases,
    });
    return { files: written, explanation, phaseTimings: result.phaseTimings };
  }

  private async writePhaseManifest(path: string, result: PhaseExecutionResult): Promise<void> {
    await writeFile(path, `${JSON.stringify({
      status: "completed",
      targetModule: result.targetModule,
      completedPhases: result.completedPhases,
      phaseTimings: result.phaseTimings,
      validationResults: result.validationResults,
    }, null, 2)}\n`, "utf8");
    logger.debug("Gameplay phase manifest written", { path, completedPhases: result.completedPhases });
  }
}
