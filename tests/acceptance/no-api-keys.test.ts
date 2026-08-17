import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";

import { BuildManager } from "../../src/agents/build-manager.js";
import { GameArchitect } from "../../src/agents/game-architect.js";
import { GamePlanner } from "../../src/agents/game-planner.js";
import { GameplayDeveloper } from "../../src/agents/gameplay-developer.js";
import { createAssetManager } from "../../src/asset-pipeline/index.js";
import { SelfRepairLoop } from "../../src/browser/repair-loop.js";
import { FactoryPipeline } from "../../src/pipeline/orchestrator.js";
import type { CodeResponse, IProvider, ProviderContext } from "../../src/providers/base.js";
import { ScaffoldGenerator } from "../../src/scaffold/generator.js";

const originalKeys = {
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  XAI_API_KEY: process.env.XAI_API_KEY,
  TRIPO3D_API_KEY: process.env.TRIPO3D_API_KEY,
};
let acceptanceRoot = "";

function renderedScreenshot(): string {
  const png = new PNG({ width: 32, height: 18 });
  for (let index = 0; index < 32 * 18; index += 1) {
    const offset = index * 4;
    const foreground = index > 200 && index < 380;
    png.data[offset] = foreground ? 230 : 24;
    png.data[offset + 1] = foreground ? 190 : 48;
    png.data[offset + 2] = foreground ? 50 : 70;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png).toString("base64");
}

function createHostProvider(): IProvider {
  return {
    kind: "codex",
    isAvailable: vi.fn(async () => true),
    generateCode: vi.fn(async (_prompt: string, context: ProviderContext): Promise<CodeResponse> => {
      if (context.role === "GamePlanner") {
        const type = context.gameBrief?.includes("3D") ? "3d" : "2d";
        return {
          code: JSON.stringify({
            title: type === "3d" ? "Offline Racer" : "Offline Platformer",
            type,
            genre: type === "3d" ? "racing" : "platformer",
            mechanics: ["movement", "collectibles", "score"],
            assets: [{
              type: type === "3d" ? "3d-model" : "sprite",
              name: "acceptance-only-asset",
              description: "A procedural acceptance test asset",
              tags: ["acceptance-unmatched"],
            }],
            quality: "LOW",
          }),
          explanation: "planned",
          files: [],
        };
      }
      const sourceEntry = Object.entries(context.files ?? {})[0];
      if (!sourceEntry) throw new Error("Gameplay context did not include its source module");
      return { code: sourceEntry[1], explanation: "Template gameplay retained", files: [{ path: sourceEntry[0], content: sourceEntry[1] }] };
    }),
    analyzeScreenshot: vi.fn(async () => ({ passed: true, issues: [], suggestions: [], confidence: 0.95 })),
    fixBug: vi.fn(async () => ({ summary: "No repair expected", patches: [] })),
  };
}

beforeAll(async () => {
  delete process.env.GOOGLE_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.TRIPO3D_API_KEY;
  acceptanceRoot = await mkdtemp(join(process.cwd(), "output", "acceptance-no-keys-"));
});

afterAll(async () => {
  Object.assign(process.env, originalKeys);
  for (const key of Object.keys(originalKeys)) {
    if (originalKeys[key as keyof typeof originalKeys] === undefined) delete process.env[key];
  }
  await rm(acceptanceRoot, { recursive: true, force: true });
}, 120_000);

describe.sequential("offline-first generation", () => {
  for (const scenario of [
    {
      type: "2d" as const,
      title: "Offline Platformer",
      prompt: "2D platformer with jumping and coins",
      timeoutMs: 300_000,
    },
    {
      type: "3d" as const,
      title: "Offline Racer",
      prompt: "3D racing game with obstacles",
      timeoutMs: 600_000,
    },
  ]) {
    it(`builds, visually validates and packages ${scenario.type} without asset API keys`, async () => {
      const projectsRoot = join(acceptanceRoot, "projects");
      const outputRoot = join(acceptanceRoot, "output");
      const provider = createHostProvider();
      const pipeline = new FactoryPipeline({
        selectProvider: async () => provider,
        createPlanner: (selected) => new GamePlanner(selected),
        createArchitect: () => new GameArchitect(new ScaffoldGenerator(), { projectsRoot, installDependencies: true }),
        createAssetManager,
        createGameplayDeveloper: (selected) => new GameplayDeveloper(selected),
        createRepairLoop: (selected) => new SelfRepairLoop(selected, {
          browserTester: {
            run: async (projectPath) => ({
              screenshot: renderedScreenshot(),
              screenshotPath: join(projectPath, ".factory", "evidence", "acceptance.png"),
              consoleErrors: [],
              consoleMessages: ["game ready"],
              requestFailures: [],
              metrics: { ready: true, fps: 60, quality: "LOW" },
              url: "http://127.0.0.1:5173",
              durationMs: 10,
            }),
          },
        }),
        createBuildManager: () => new BuildManager({ outputRoot }),
      });

      const result = await pipeline.run(scenario.prompt, "LOW", "codex", { title: scenario.title, type: scenario.type });

      expect(result.plan.type).toBe(scenario.type);
      expect(result.assets.fallbackCount).toBeGreaterThan(0);
      expect(result.validation.passed).toBe(true);
      expect((await stat(join(result.projectPath, "dist"))).isDirectory()).toBe(true);
      expect((await stat(result.production.packagePath)).size).toBeGreaterThan(100);
    }, scenario.timeoutMs);
  }
});
