import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createLogger } from "../core/logger.js";
import type { CodeResponse, IProvider } from "../providers/base.js";
import type { GamePlan } from "./game-planner.js";
import type { GameplayPhase } from "./gameplay-phases.js";
import { buildPhasePrompt } from "./phase-prompts.js";

const DEFAULT_HARD_TIMEOUT_MS = 120_000;

export interface PhaseTiming {
  name: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  timeoutMs: number;
  status: "completed" | "failed";
}

export interface PhaseExecutionResult {
  targetModule: string;
  code: string;
  completedPhases: string[];
  phaseTimings: PhaseTiming[];
  explanations: string[];
}

export interface PhaseOrchestratorOptions {
  hardTimeoutMs?: number;
  now?: () => number;
}

export class GameplayPhaseExecutionError extends Error {
  public readonly cause: unknown;

  public constructor(
    public readonly phase: GameplayPhase,
    public readonly completedPhases: readonly string[],
    public readonly partialCode: string,
    public readonly phaseTimings: readonly PhaseTiming[],
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Gameplay phase '${phase.name}' failed: ${reason}`);
    this.name = "GameplayPhaseExecutionError";
    this.cause = cause;
  }
}

const logger = createLogger("phase-orchestrator");

function selectReplacement(response: CodeResponse, targetModule: string): string {
  const targetFile = response.files.find((file) => file.path === targetModule && file.content.trim());
  const code = targetFile?.content ?? response.code;
  if (!code.trim()) {
    throw new Error(`Provider returned no replacement code for ${targetModule}`);
  }
  return code;
}

export class PhaseOrchestrator {
  private readonly hardTimeoutMs: number;
  private readonly now: () => number;

  public constructor(options: PhaseOrchestratorOptions = {}) {
    this.hardTimeoutMs = options.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  public async executePhases(
    phases: GameplayPhase[],
    plan: GamePlan,
    projectPath: string,
    provider: IProvider,
  ): Promise<PhaseExecutionResult> {
    const targetModule = plan.type === "2d" ? "src/game2d.ts" : "src/game3d.ts";
    let accumulatedCode = await readFile(resolve(projectPath, targetModule), "utf8");
    const completedPhases: string[] = [];
    const phaseTimings: PhaseTiming[] = [];
    const explanations: string[] = [];

    logger.info("Gameplay phase execution started", {
      projectPath,
      targetModule,
      phaseCount: phases.length,
      hardTimeoutMs: this.hardTimeoutMs,
    });
    for (const [index, phase] of phases.entries()) {
      const startedMs = this.now();
      const startedAt = new Date(startedMs).toISOString();
      logger.info("Gameplay phase started", {
        phase: phase.name,
        phaseNumber: index + 1,
        phaseCount: phases.length,
        completedPhases,
      });
      try {
        const response = await this.withTimeout(
          provider.generateCode(buildPhasePrompt(phase, plan, accumulatedCode), {
            projectPath,
            role: "GameplayDeveloper",
            gameBrief: plan.description,
            files: { [targetModule]: accumulatedCode },
            metadata: {
              type: plan.type,
              genre: plan.genre,
              quality: plan.quality,
              phase: phase.name,
              phaseNumber: index + 1,
              phaseCount: phases.length,
            },
          }),
          phase,
        );
        const nextCode = selectReplacement(response, targetModule);
        const completedMs = this.now();
        const timing: PhaseTiming = {
          name: phase.name,
          startedAt,
          completedAt: new Date(completedMs).toISOString(),
          durationMs: Math.max(0, completedMs - startedMs),
          timeoutMs: this.hardTimeoutMs,
          status: "completed",
        };
        accumulatedCode = nextCode;
        completedPhases.push(phase.name);
        phaseTimings.push(timing);
        explanations.push(response.explanation);
        logger.info("Gameplay phase completed", {
          phase: phase.name,
          durationMs: timing.durationMs,
          codeBytes: accumulatedCode.length,
          completedPhaseCount: completedPhases.length,
        });
      } catch (error) {
        const failedMs = this.now();
        phaseTimings.push({
          name: phase.name,
          startedAt,
          completedAt: new Date(failedMs).toISOString(),
          durationMs: Math.max(0, failedMs - startedMs),
          timeoutMs: this.hardTimeoutMs,
          status: "failed",
        });
        logger.error("Gameplay phase failed; preserving last working state", error, {
          phase: phase.name,
          completedPhases,
          partialCodeBytes: accumulatedCode.length,
        });
        throw new GameplayPhaseExecutionError(
          phase,
          completedPhases,
          accumulatedCode,
          phaseTimings,
          error,
        );
      }
    }

    logger.info("Gameplay phase execution completed", {
      projectPath,
      completedPhases,
      totalDurationMs: phaseTimings.reduce((total, timing) => total + timing.durationMs, 0),
    });
    return { targetModule, code: accumulatedCode, completedPhases, phaseTimings, explanations };
  }

  private async withTimeout<T>(operation: Promise<T>, phase: GameplayPhase): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        logger.warn("Gameplay phase exceeded hard timeout", {
          phase: phase.name,
          timeoutMs: this.hardTimeoutMs,
        });
        reject(new Error(`phase timed out after ${this.hardTimeoutMs}ms`));
      }, this.hardTimeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
