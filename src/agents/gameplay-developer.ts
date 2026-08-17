import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createLogger } from "../core/logger.js";
import type { IProvider } from "../providers/base.js";
import type { GamePlan } from "./game-planner.js";
import { resolveGameplayPhases } from "./gameplay-phases.js";
import {
  PhaseOrchestrator,
  GameplayPhaseExecutionError,
  type PhaseExecutionResult,
  type PhaseTiming,
  type PhaseValidationResult,
} from "./phase-orchestrator.js";

export interface GameplayDevelopmentResult {
  files: string[];
  explanation: string;
  phaseTimings: PhaseTiming[];
}

const logger = createLogger("agent-gameplay-developer");

interface PersistedPhaseState {
  completedPhases: string[];
  phaseTimings: PhaseTiming[];
  validationResults: PhaseValidationResult[];
}

export class GameplayDeveloper {
  public constructor(
    private readonly provider: IProvider,
    private readonly phaseOrchestrator: Pick<PhaseOrchestrator, "executePhases"> = new PhaseOrchestrator(),
  ) {}

  public async writeCode(plan: GamePlan, projectPathInput: string): Promise<GameplayDevelopmentResult> {
    const projectPath = resolve(projectPathInput);
    const targetModule = plan.type === "2d" ? "src/game2d.ts" : "src/game3d.ts";
    const phases = resolveGameplayPhases(plan.type);
    const phaseManifestPath = resolve(projectPath, ".factory", "gameplay-phases.json");
    const resumeState = await this.loadResumeState(phaseManifestPath, phases.map((phase) => phase.name));
    const pendingPhases = phases.slice(resumeState.completedPhases.length);
    if (resumeState.completedPhases.length > 0) {
      // A future --resume-from-phase CLI flag can override this automatic last-successful-phase behavior.
      logger.info("Resuming gameplay phase generation", {
        projectPath,
        skippedPhases: resumeState.completedPhases,
        remainingPhases: pendingPhases.map((phase) => phase.name),
      });
    }
    logger.info("Generating gameplay code in phases", {
      projectPath,
      type: plan.type,
      genre: plan.genre,
      mechanics: plan.mechanics,
      targetModule,
      phaseCount: phases.length,
    });
    let incrementalResult: PhaseExecutionResult;
    try {
      incrementalResult = await this.phaseOrchestrator
        .executePhases(pendingPhases, plan, projectPath, this.provider);
    } catch (error) {
      if (!(error instanceof GameplayPhaseExecutionError)) throw error;
      const combinedError = new GameplayPhaseExecutionError(
        error.phase,
        [...resumeState.completedPhases, ...error.completedPhases],
        error.partialCode,
        [...resumeState.phaseTimings, ...error.phaseTimings],
        error.cause,
      );
      await this.writePhaseManifest(phaseManifestPath, {
        status: "failed",
        targetModule,
        completedPhases: [...combinedError.completedPhases],
        phaseTimings: [...combinedError.phaseTimings],
        validationResults: resumeState.validationResults,
        failedPhase: combinedError.phase.name,
        error: combinedError.message,
      });
      throw combinedError;
    }
    const result: PhaseExecutionResult = {
      ...incrementalResult,
      completedPhases: [...resumeState.completedPhases, ...incrementalResult.completedPhases],
      phaseTimings: [...resumeState.phaseTimings, ...incrementalResult.phaseTimings],
      validationResults: [...resumeState.validationResults, ...incrementalResult.validationResults],
    };
    const written = [result.targetModule];
    const manifestPath = resolve(projectPath, ".factory", "gameplay-generation.json");
    await mkdir(dirname(manifestPath), { recursive: true });
    const explanation = result.explanations.filter(Boolean).join("\n");
    await Promise.all([
      writeFile(
        manifestPath,
        `${JSON.stringify({ provider: this.provider.kind, files: written, explanation }, null, 2)}\n`,
        "utf8",
      ),
      this.writePhaseManifest(phaseManifestPath, {
        status: "completed",
        targetModule: result.targetModule,
        completedPhases: result.completedPhases,
        phaseTimings: result.phaseTimings,
        validationResults: result.validationResults,
      }),
    ]);
    logger.info("Gameplay code generated", {
      projectPath,
      files: written,
      provider: this.provider.kind,
      completedPhases: result.completedPhases,
    });
    return { files: written, explanation, phaseTimings: result.phaseTimings };
  }

  private async loadResumeState(path: string, phaseNames: readonly string[]): Promise<PersistedPhaseState> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { completedPhases: [], phaseTimings: [], validationResults: [] };
      }
      logger.warn("Ignoring unreadable gameplay phase manifest", {
        path,
        reason: error instanceof Error ? error.message : String(error),
      });
      return { completedPhases: [], phaseTimings: [], validationResults: [] };
    }
    if (!parsed || typeof parsed !== "object") {
      return { completedPhases: [], phaseTimings: [], validationResults: [] };
    }
    const record = parsed as Record<string, unknown>;
    const storedNames = Array.isArray(record.completedPhases)
      ? record.completedPhases.filter((name): name is string => typeof name === "string")
      : [];
    let prefixLength = 0;
    while (phaseNames[prefixLength] && storedNames[prefixLength] === phaseNames[prefixLength]) {
      prefixLength += 1;
    }
    const completedPhases = storedNames.slice(0, prefixLength);
    const storedTimings = Array.isArray(record.phaseTimings) ? record.phaseTimings as PhaseTiming[] : [];
    const storedValidation = Array.isArray(record.validationResults)
      ? record.validationResults as PhaseValidationResult[]
      : [];
    return {
      completedPhases,
      phaseTimings: storedTimings.filter((timing) => completedPhases.includes(timing.name)),
      validationResults: storedValidation.filter((validation) => completedPhases.includes(validation.phase)),
    };
  }

  private async writePhaseManifest(path: string, value: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    logger.debug("Gameplay phase manifest written", {
      path,
      status: value.status,
      completedPhases: value.completedPhases,
    });
  }
}
