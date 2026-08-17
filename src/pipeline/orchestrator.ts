import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { BuildManager, type ProductionPackage } from "../agents/build-manager.js";
import { GameArchitect } from "../agents/game-architect.js";
import { GamePlanner, type GamePlan } from "../agents/game-planner.js";
import { GameplayDeveloper } from "../agents/gameplay-developer.js";
import type { GameplayPhase } from "../agents/gameplay-phases.js";
import { PhaseOrchestrator, type PhaseOrchestratorOptions, type PhaseTiming } from "../agents/phase-orchestrator.js";
import { createAssetManager } from "../asset-pipeline/index.js";
import type { AssetManager } from "../asset-pipeline/manager.js";
import type { AssetResolutionReport } from "../asset-pipeline/types.js";
import { SelfRepairLoop, type RepairLoopResult } from "../browser/repair-loop.js";
import { createLogger } from "../core/logger.js";
import type { IProvider } from "../providers/base.js";
import { createProvider, type ProviderSelection } from "../providers/factory.js";

export type PipelineStage =
  | "provider"
  | "planning"
  | "architecture"
  | "assets"
  | "gameplay"
  | "browser-test"
  | "visual-test"
  | "optimization"
  | "yandex-validation"
  | "production-build";

export interface PipelineProgress {
  stage: PipelineStage;
  status: "started" | "completed" | "failed";
  message: string;
  timestamp: string;
}

export interface PipelineRunOptions {
  title?: string;
  type?: "auto" | "2d" | "3d";
  onProgress?: (event: PipelineProgress) => void;
  onPhaseProgress?: (phase: GameplayPhase, elapsedMs: number, timeoutMs: number) => void;
}

export interface FactoryPipelineResult {
  plan: GamePlan;
  projectPath: string;
  assets: AssetResolutionReport;
  validation: RepairLoopResult;
  production: ProductionPackage;
  provider: string;
  phaseTimings: PhaseTiming[];
}

interface PipelineDependencies {
  selectProvider: (selection: ProviderSelection) => Promise<IProvider>;
  createPlanner: (provider: IProvider) => Pick<GamePlanner, "analyze">;
  createArchitect: () => Pick<GameArchitect, "scaffold">;
  createAssetManager: () => Pick<AssetManager, "resolveAssets">;
  createGameplayDeveloper: (
    provider: IProvider,
    options?: PhaseOrchestratorOptions,
  ) => Pick<GameplayDeveloper, "writeCode">;
  createRepairLoop: (provider: IProvider) => Pick<SelfRepairLoop, "run">;
  createBuildManager: () => Pick<BuildManager, "buildForYandex">;
}

const defaultDependencies: PipelineDependencies = {
  selectProvider: createProvider,
  createPlanner: (provider) => new GamePlanner(provider),
  createArchitect: () => new GameArchitect(),
  createAssetManager,
  createGameplayDeveloper: (provider, options = {}) => (
    new GameplayDeveloper(provider, new PhaseOrchestrator(options))
  ),
  createRepairLoop: (provider) => new SelfRepairLoop(provider),
  createBuildManager: () => new BuildManager(),
};

const logger = createLogger("factory-pipeline");

export class FactoryPipeline {
  public constructor(private readonly dependencies: PipelineDependencies = defaultDependencies) {}

  public async run(
    prompt: string,
    quality: string,
    providerSelection: string,
    options: PipelineRunOptions = {},
  ): Promise<FactoryPipelineResult> {
    let projectPath: string | undefined;
    let currentStage: PipelineStage = "provider";
    const progress = (stage: PipelineStage, status: PipelineProgress["status"], message: string): void => {
      currentStage = stage;
      const event = { stage, status, message, timestamp: new Date().toISOString() };
      logger[status === "failed" ? "warn" : "info"]("Pipeline stage update", event);
      options.onProgress?.(event);
    };
    try {
      const selection = providerSelection.toLowerCase();
      if (!(["auto", "claude", "codex", "codex-only"] as string[]).includes(selection)) {
        throw new Error(`Unknown provider selection: ${providerSelection}`);
      }
      progress("provider", "started", "Selecting host agent");
      const provider = await this.dependencies.selectProvider(selection as ProviderSelection);
      progress("provider", "completed", `Using ${provider.kind}`);

      progress("planning", "started", "Analyzing the game brief");
      const plan = await this.dependencies.createPlanner(provider).analyze(prompt, quality, {
        ...(options.title ? { title: options.title } : {}),
        ...(options.type ? { type: options.type } : {}),
      });
      progress("planning", "completed", `${plan.type.toUpperCase()} ${plan.genre} planned for ${plan.quality}`);

      progress("architecture", "started", "Scaffolding an independent game project");
      projectPath = await this.dependencies.createArchitect().scaffold(plan);
      progress("architecture", "completed", projectPath);

      progress("assets", "started", "Resolving assets through AI, local and procedural fallbacks");
      const assets = await this.dependencies.createAssetManager().resolveAssets(plan.assets, projectPath);
      progress("assets", "completed", `${assets.assets.length} assets resolved; ${assets.fallbackCount} procedural`);

      progress("gameplay", "started", "Generating gameplay, controls and rules");
      const phaseOrchestratorOptions: PhaseOrchestratorOptions = {
        ...(options.onPhaseProgress ? { onPhaseProgress: options.onPhaseProgress } : {}),
      };
      const gameplay = await this.dependencies
        .createGameplayDeveloper(provider, phaseOrchestratorOptions)
        .writeCode(plan, projectPath);
      progress("gameplay", "completed", "Gameplay source generated");

      progress("browser-test", "started", "Building and running the game in Chromium");
      const validation = await this.dependencies.createRepairLoop(provider).run(projectPath);
      progress("browser-test", "completed", `Runtime passed after ${validation.iterations.length} iteration(s)`);
      progress("visual-test", "completed", `Visual evidence passed via ${validation.review.source}`);
      progress("optimization", "completed", `${plan.quality} budget active`);

      progress("yandex-validation", "started", "Validating Yandex Games production requirements");
      progress("production-build", "started", "Creating production ZIP");
      const production = await this.dependencies.createBuildManager().buildForYandex(projectPath);
      progress("yandex-validation", "completed", "Yandex Games SDK v2 verified");
      progress("production-build", "completed", production.packagePath);
      const result: FactoryPipelineResult = {
        plan,
        projectPath,
        assets,
        validation,
        production,
        provider: provider.kind,
        phaseTimings: gameplay.phaseTimings,
      };
      await this.writeManifest(join(projectPath, ".factory", "pipeline-result.json"), {
        status: "completed",
        provider: provider.kind,
        plan,
        packagePath: production.packagePath,
        validationIterations: validation.iterations.length,
        phaseTimings: gameplay.phaseTimings,
      });
      return result;
    } catch (error) {
      progress(currentStage, "failed", error instanceof Error ? error.message : String(error));
      if (projectPath) {
        await this.writeManifest(join(projectPath, ".factory", "pipeline-result.json"), {
          status: "failed",
          stage: currentStage,
          error: error instanceof Error ? error.message : String(error),
        }).catch((manifestError: unknown) => logger.error("Unable to write pipeline failure manifest", manifestError));
      }
      logger.error("Factory pipeline failed", error, { stage: currentStage, projectPath });
      throw error;
    }
  }

  private async writeManifest(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    logger.debug("Pipeline manifest written", { path });
  }
}
