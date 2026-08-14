import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GameArchitect } from "../../src/agents/game-architect.js";
import type { GamePlan } from "../../src/agents/game-planner.js";
import { ScaffoldGenerator, createGameSlug } from "../../src/scaffold/generator.js";

const createdDirectories: string[] = [];
const plan: GamePlan = {
  title: "Низкополигональная гонка",
  description: "Collect coins and avoid obstacles",
  type: "3d",
  genre: "racing",
  mechanics: ["drive", "collect"],
  assets: [],
  quality: "LOW",
};

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GameArchitect", () => {
  it("scaffolds the selected render path and applies its performance budget", async () => {
    const projectsRoot = await mkdtemp(join(process.cwd(), "projects", "architect-test-"));
    createdDirectories.push(projectsRoot);
    const architect = new GameArchitect(new ScaffoldGenerator(), { projectsRoot, installDependencies: false });

    const projectPath = await architect.scaffold(plan);

    expect(createGameSlug(plan.title)).toMatch(/^game-[a-f0-9]{10}$/u);
    expect(await readFile(join(projectPath, "src", "main.ts"), "utf8")).toContain("engine.setHardwareScalingLevel(2)");
    expect(JSON.parse(await readFile(join(projectPath, ".factory", "performance-budget.json"), "utf8")))
      .toMatchObject({ preset: "LOW", shadowsEnabled: false, maxParticles: 50 });
  });
});
