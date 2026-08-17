import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FactoryPipeline, type PipelineProgress } from "../../src/pipeline/orchestrator.js";
import { GameplayPhaseExecutionError } from "../../src/agents/phase-orchestrator.js";
import type { IProvider } from "../../src/providers/base.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("FactoryPipeline", () => {
  it("runs all proof and packaging stages in dependency order", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "pipeline-test-"));
    createdDirectories.push(projectPath);
    const calls: string[] = [];
    const progress: PipelineProgress[] = [];
    const provider = { kind: "codex-only" } as IProvider;
    const phaseTimings = [{
      name: "scaffold",
      startedAt: "2026-08-17T00:00:00.000Z",
      completedAt: "2026-08-17T00:00:01.000Z",
      durationMs: 1_000,
      timeoutMs: 90_000,
      status: "completed" as const,
    }];
    const pipeline = new FactoryPipeline({
      selectProvider: async () => { calls.push("provider"); return provider; },
      createPlanner: () => ({ analyze: async () => {
        calls.push("planner");
        return { title: "Test", description: "Test game", type: "2d", genre: "arcade", mechanics: ["score"], assets: [], quality: "LOW" };
      } }),
      createArchitect: () => ({ scaffold: async () => { calls.push("architect"); return projectPath; } }),
      createAssetManager: () => ({ resolveAssets: async () => { calls.push("assets"); return { assets: [], fallbackCount: 0 }; } }),
      createGameplayDeveloper: () => ({ writeCode: async () => {
        calls.push("gameplay");
        return { files: [], explanation: "", phaseTimings };
      } }),
      createRepairLoop: () => ({ run: async () => {
        calls.push("repair");
        return {
          passed: true as const,
          iterations: [{ iteration: 1, buildPassed: true, fixed: false }],
          browserResult: { screenshot: "", screenshotPath: "", consoleErrors: [], consoleMessages: [], requestFailures: [], metrics: {}, url: "", durationMs: 1 },
          review: { passed: true, issues: [], suggestions: [], confidence: 1, source: "local" as const, evidence: { width: 1, height: 1, visiblePixelRatio: 1, meanLuminance: 50, luminanceDeviation: 10 } },
        };
      } }),
      createBuildManager: () => ({ buildForYandex: async () => {
        calls.push("build");
        return { projectPath, distPath: join(projectPath, "dist"), packagePath: join(projectPath, "game.zip"), sizeBytes: 100 };
      } }),
    });

    const result = await pipeline.run("Make an arcade game", "LOW", "codex-only", { onProgress: (event) => progress.push(event) });

    expect(calls).toEqual(["provider", "planner", "architect", "assets", "gameplay", "repair", "build"]);
    expect(result.production.packagePath).toContain("game.zip");
    expect(result.provider).toBe("codex-only");
    expect(result.phaseTimings).toEqual(phaseTimings);
    expect(progress.some((event) => event.stage === "visual-test" && event.status === "completed")).toBe(true);
    expect(progress).toContainEqual(expect.objectContaining({
      stage: "gameplay-phase-1",
      status: "completed",
      phase: {
        number: 1,
        total: 4,
        name: "scaffold",
        elapsedMs: 1_000,
        timeoutMs: 90_000,
      },
    }));
    expect(progress.at(-1)).toMatchObject({ stage: "production-build", status: "completed" });
    const manifest = JSON.parse(
      await readFile(join(projectPath, ".factory", "pipeline-result.json"), "utf8"),
    ) as { phaseTimings: unknown };
    expect(manifest.phaseTimings).toEqual(phaseTimings);
  });

  it("records phase failures and preserves the generated partial source", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "pipeline-phase-failure-test-"));
    createdDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"));
    const partialCode = "export const completedScene = true;";
    const failedPhase = {
      name: "camera-controls",
      scope: "Add camera controls",
      dependencies: ["scene-setup"],
      estimatedTimeMs: 70_000,
    };
    const timing = {
      name: failedPhase.name,
      startedAt: "2026-08-17T00:00:00.000Z",
      completedAt: "2026-08-17T00:00:01.000Z",
      durationMs: 1_000,
      timeoutMs: 90_000,
      status: "failed" as const,
    };
    const provider = { kind: "codex" } as IProvider;
    const pipeline = new FactoryPipeline({
      selectProvider: async () => provider,
      createPlanner: () => ({ analyze: async () => ({
        title: "Test",
        description: "Test game",
        type: "3d" as const,
        genre: "arena",
        mechanics: ["movement"],
        assets: [],
        quality: "LOW" as const,
      }) }),
      createArchitect: () => ({ scaffold: async () => projectPath }),
      createAssetManager: () => ({ resolveAssets: async () => ({ assets: [], fallbackCount: 0 }) }),
      createGameplayDeveloper: (_selected, options) => ({ writeCode: async () => {
        options?.onPhaseProgress?.(failedPhase, 67_500, 90_000);
        await writeFile(join(projectPath, "src", "game3d.ts"), partialCode, "utf8");
        throw new GameplayPhaseExecutionError(
          failedPhase,
          ["scene-setup"],
          partialCode,
          [timing],
          new Error("provider timed out"),
        );
      } }),
      createRepairLoop: () => ({ run: vi.fn() }),
      createBuildManager: () => ({ buildForYandex: vi.fn() }),
    });

    await expect(pipeline.run("Make an arena", "LOW", "codex")).rejects.toThrow("camera-controls");

    expect(await readFile(join(projectPath, "src", "game3d.ts"), "utf8")).toBe(partialCode);
    const failure = JSON.parse(
      await readFile(join(projectPath, ".factory", "phase-failure.json"), "utf8"),
    ) as { phase: string; completedPhases: string[]; codeSnapshot: string };
    expect(failure).toEqual(expect.objectContaining({
      phase: "camera-controls",
      completedPhases: ["scene-setup"],
      codeSnapshot: partialCode,
    }));
    const pipelineManifest = JSON.parse(
      await readFile(join(projectPath, ".factory", "pipeline-result.json"), "utf8"),
    ) as { status: string; stage: string; phaseTimings: unknown[] };
    expect(pipelineManifest).toMatchObject({
      status: "failed",
      stage: "gameplay-phase-2",
      phaseTimings: [timing],
    });
  });
});
