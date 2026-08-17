import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FactoryPipeline, type PipelineProgress } from "../../src/pipeline/orchestrator.js";
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
    const pipeline = new FactoryPipeline({
      selectProvider: async () => { calls.push("provider"); return provider; },
      createPlanner: () => ({ analyze: async () => {
        calls.push("planner");
        return { title: "Test", description: "Test game", type: "2d", genre: "arcade", mechanics: ["score"], assets: [], quality: "LOW" };
      } }),
      createArchitect: () => ({ scaffold: async () => { calls.push("architect"); return projectPath; } }),
      createAssetManager: () => ({ resolveAssets: async () => { calls.push("assets"); return { assets: [], fallbackCount: 0 }; } }),
      createGameplayDeveloper: () => ({ writeCode: async () => { calls.push("gameplay"); return { files: [], explanation: "" }; } }),
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
    expect(progress.some((event) => event.stage === "visual-test" && event.status === "completed")).toBe(true);
    expect(progress.at(-1)).toMatchObject({ stage: "production-build", status: "completed" });
  });
});
