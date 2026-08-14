import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameArchitect } from "../../src/agents/game-architect.js";
import type { GamePlan } from "../../src/agents/game-planner.js";
import { RuntimePerformanceMonitor } from "../../templates/babylon-base/src/performance/monitor.js";
import { ScaffoldGenerator } from "../../src/scaffold/generator.js";

const createdDirectories: string[] = [];

beforeEach(() => {
  vi.stubGlobal("window", { devicePixelRatio: 1, __GAME_METRICS__: {} });
  vi.stubGlobal("navigator", { userAgent: "Desktop", hardwareConcurrency: 2, deviceMemory: 2 });
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({}) }) });
});

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("LOW preset acceptance", () => {
  it("injects compatibility limits and sustains its 30 FPS target", async () => {
    const projectsRoot = await mkdtemp(join(process.cwd(), "projects", "low-acceptance-"));
    createdDirectories.push(projectsRoot);
    const plan: GamePlan = {
      title: "Potato Racer",
      description: "A low-end racing game",
      type: "3d",
      genre: "racing",
      mechanics: ["drive"],
      assets: [],
      quality: "LOW",
    };
    const projectPath = await new GameArchitect(new ScaffoldGenerator(), {
      projectsRoot,
      installDependencies: false,
    }).scaffold(plan);

    const main = await readFile(join(projectPath, "src", "main.ts"), "utf8");
    expect(main).toContain("engine.setHardwareScalingLevel(2)");
    expect(main).toContain("shadowsEnabled: false");
    expect(main).toContain("maxParticles: 50");

    const setHardwareScalingLevel = vi.fn();
    const monitor = new RuntimePerformanceMonitor(
      { getFps: () => 30, setHardwareScalingLevel },
      "LOW",
      { showOverlay: false },
    );
    for (let frame = 0; frame < 30; frame += 1) monitor.onFrame();

    expect(monitor.getQuality()).toBe("LOW");
    expect(window.__GAME_METRICS__).toMatchObject({ fps: 30, targetFPS: 30, hardwareScalingLevel: 2 });
  });
});
