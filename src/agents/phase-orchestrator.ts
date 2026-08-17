import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { createLogger } from "../core/logger.js";
import type { CodeResponse, IProvider } from "../providers/base.js";
import { runProcess, type ProcessRunner } from "../providers/process-runner.js";
import type { GamePlan } from "./game-planner.js";
import type { GameplayPhase } from "./gameplay-phases.js";
import { buildPhasePrompt } from "./phase-prompts.js";

const DEFAULT_HARD_TIMEOUT_MS = 120_000;
const DEFAULT_VALIDATION_TIMEOUT_MS = 5_000;
const BACKUP_RETENTION_MS = 24 * 60 * 60 * 1_000;

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
  validationResults: PhaseValidationResult[];
}

export interface PhaseValidationResult {
  phase: string;
  attempt: number;
  passed: boolean;
  durationMs: number;
  diagnostics: string;
  timestamp: string;
}

export interface PhaseOrchestratorOptions {
  hardTimeoutMs?: number;
  validationTimeoutMs?: number;
  now?: () => number;
  runner?: ProcessRunner;
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
  const unexpectedFile = response.files.find((file) => file.content.trim() && file.path !== targetModule);
  if (unexpectedFile) {
    throw new Error(`Gameplay phase may replace only ${targetModule}: ${unexpectedFile.path}`);
  }
  const targetFile = response.files.find((file) => file.path === targetModule && file.content.trim());
  const code = targetFile?.content ?? response.code;
  if (!code.trim()) {
    throw new Error(`Provider returned no replacement code for ${targetModule}`);
  }
  return code;
}

export class PhaseOrchestrator {
  private readonly hardTimeoutMs: number;
  private readonly validationTimeoutMs: number;
  private readonly now: () => number;
  private readonly runner: ProcessRunner;

  public constructor(options: PhaseOrchestratorOptions = {}) {
    this.hardTimeoutMs = options.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS;
    this.validationTimeoutMs = options.validationTimeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.runner = options.runner ?? runProcess;
  }

  public async executePhases(
    phases: GameplayPhase[],
    plan: GamePlan,
    projectPath: string,
    provider: IProvider,
  ): Promise<PhaseExecutionResult> {
    const targetModule = plan.type === "2d" ? "src/game2d.ts" : "src/game3d.ts";
    const targetPath = resolve(projectPath, targetModule);
    const backupDirectory = resolve(projectPath, ".factory", "backups");
    const validationManifestPath = resolve(projectPath, ".factory", "phase-validation.json");
    let accumulatedCode = await readFile(targetPath, "utf8");
    const completedPhases: string[] = [];
    const phaseTimings: PhaseTiming[] = [];
    const explanations: string[] = [];
    const validationResults: PhaseValidationResult[] = [];

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
        let candidateCode = accumulatedCode;
        let explanation = "";
        let validationFeedback: string | undefined;
        let isValid = false;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const response = await this.requestPhase(
            provider,
            phase,
            plan,
            projectPath,
            targetModule,
            candidateCode,
            index,
            phases.length,
            validationFeedback,
          );
          candidateCode = selectReplacement(response, targetModule);
          explanation = response.explanation;
          await this.createBackup(backupDirectory, phase, attempt, targetPath);
          const validation = await this.validateRevision(
            phase,
            attempt,
            candidateCode,
            projectPath,
            targetPath,
          );
          validationResults.push(validation);
          await this.writeValidationManifest(validationManifestPath, validationResults);
          if (validation.passed) {
            isValid = true;
            break;
          }
          validationFeedback = validation.diagnostics;
          logger.warn("Gameplay phase validation failed; retrying phase", {
            phase: phase.name,
            attempt,
            durationMs: validation.durationMs,
            diagnostics: validation.diagnostics.slice(-1_000),
            willRetry: attempt === 1,
          });
        }
        if (!isValid) {
          throw new Error(`TypeScript validation failed after retry: ${validationFeedback ?? "unknown error"}`);
        }
        const completedMs = this.now();
        const timing: PhaseTiming = {
          name: phase.name,
          startedAt,
          completedAt: new Date(completedMs).toISOString(),
          durationMs: Math.max(0, completedMs - startedMs),
          timeoutMs: this.hardTimeoutMs,
          status: "completed",
        };
        accumulatedCode = candidateCode;
        completedPhases.push(phase.name);
        phaseTimings.push(timing);
        explanations.push(explanation);
        logger.debug("Gameplay phase code revision accumulated", {
          phase: phase.name,
          targetModule,
          previousPhase: completedPhases.at(-2),
          codeBytes: accumulatedCode.length,
        });
        logger.info("Gameplay phase completed", {
          phase: phase.name,
          durationMs: timing.durationMs,
          codeBytes: accumulatedCode.length,
          completedPhaseCount: completedPhases.length,
        });
      } catch (error) {
        await writeFile(targetPath, accumulatedCode, "utf8").catch((rollbackError: unknown) => {
          logger.error("Unable to restore last working gameplay revision", rollbackError, {
            phase: phase.name,
            targetPath,
          });
        });
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
    await this.cleanupOldBackups(backupDirectory);
    return {
      targetModule,
      code: accumulatedCode,
      completedPhases,
      phaseTimings,
      explanations,
      validationResults,
    };
  }

  private async requestPhase(
    provider: IProvider,
    phase: GameplayPhase,
    plan: GamePlan,
    projectPath: string,
    targetModule: string,
    currentCode: string,
    phaseIndex: number,
    phaseCount: number,
    validationFeedback?: string,
  ): Promise<CodeResponse> {
    return this.withTimeout(
      provider.generateCode(buildPhasePrompt(phase, plan, currentCode, validationFeedback), {
        projectPath,
        role: "GameplayDeveloper",
        gameBrief: plan.description,
        files: { [targetModule]: currentCode },
        metadata: {
          type: plan.type,
          genre: plan.genre,
          quality: plan.quality,
          phase: phase.name,
          phaseNumber: phaseIndex + 1,
          phaseCount,
          retry: Boolean(validationFeedback),
        },
      }),
      phase,
    );
  }

  private async validateRevision(
    phase: GameplayPhase,
    attempt: number,
    candidateCode: string,
    projectPath: string,
    targetPath: string,
  ): Promise<PhaseValidationResult> {
    await this.writeRevision(targetPath, candidateCode, phase.name, attempt);
    const startedMs = this.now();
    logger.debug("TypeScript phase validation started", {
      phase: phase.name,
      attempt,
      targetPath,
      timeoutMs: this.validationTimeoutMs,
    });
    try {
      const result = await this.runner("npm", ["exec", "tsc", "--", "--noEmit", "--pretty", "false"], {
        cwd: projectPath,
        timeoutMs: this.validationTimeoutMs,
      });
      const durationMs = Math.max(0, this.now() - startedMs);
      const diagnostics = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(-4_000);
      const validation = {
        phase: phase.name,
        attempt,
        passed: result.exitCode === 0,
        durationMs,
        diagnostics,
        timestamp: new Date(this.now()).toISOString(),
      };
      if (validation.passed) {
        logger.info("Gameplay phase TypeScript validation passed", {
          phase: phase.name,
          attempt,
          durationMs,
        });
      }
      return validation;
    } catch (error) {
      const durationMs = Math.max(0, this.now() - startedMs);
      logger.error("Gameplay phase TypeScript validation failed to run", error, {
        phase: phase.name,
        attempt,
        durationMs,
      });
      return {
        phase: phase.name,
        attempt,
        passed: false,
        durationMs,
        diagnostics: error instanceof Error ? error.message : String(error),
        timestamp: new Date(this.now()).toISOString(),
      };
    }
  }

  private async createBackup(
    backupDirectory: string,
    phase: GameplayPhase,
    attempt: number,
    targetPath: string,
  ): Promise<void> {
    await mkdir(backupDirectory, { recursive: true });
    const currentCode = await readFile(targetPath, "utf8");
    const timestamp = new Date(this.now()).toISOString().replace(/[:.]/gu, "-");
    const backupPath = resolve(backupDirectory, `${phase.name}-${timestamp}-${attempt}.ts`);
    await writeFile(backupPath, currentCode, "utf8");
    logger.debug("Gameplay phase backup created", {
      phase: phase.name,
      attempt,
      backupPath,
      bytes: currentCode.length,
    });
  }

  private async writeRevision(
    targetPath: string,
    code: string,
    phaseName: string,
    attempt: number,
  ): Promise<void> {
    const temporaryPath = resolve(dirname(targetPath), `.${basename(targetPath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, code, "utf8");
      await rename(temporaryPath, targetPath);
      logger.debug("Gameplay phase revision written atomically", {
        phase: phaseName,
        attempt,
        targetPath,
        bytes: code.length,
      });
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private async cleanupOldBackups(backupDirectory: string): Promise<void> {
    const entries = await readdir(backupDirectory, { withFileTypes: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    const cutoffMs = this.now() - BACKUP_RETENTION_MS;
    let removedCount = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const path = resolve(backupDirectory, entry.name);
      if ((await stat(path)).mtimeMs >= cutoffMs) continue;
      await unlink(path);
      removedCount += 1;
    }
    logger.info("Gameplay phase backup cleanup completed", {
      backupDirectory,
      removedCount,
      retentionMs: BACKUP_RETENTION_MS,
    });
  }

  private async writeValidationManifest(
    path: string,
    validationResults: readonly PhaseValidationResult[],
  ): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify({ validationResults }, null, 2)}\n`, "utf8");
    logger.debug("Phase validation manifest written", { path, resultCount: validationResults.length });
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
