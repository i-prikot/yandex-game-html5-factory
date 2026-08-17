import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GameplayDeveloper } from "../../src/agents/gameplay-developer.js";
import type { GamePlan } from "../../src/agents/game-planner.js";
import type { IProvider } from "../../src/providers/base.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("phased gameplay generation", () => {
  it("completes every 3D phase within the former monolithic timeout", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "phased-acceptance-test-"));
    createdDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"));
    await writeFile(join(projectPath, "src", "game3d.ts"), "export const phases = [] as const;", "utf8");
    await writeFile(join(projectPath, "tsconfig.json"), `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
      },
      include: ["src/**/*.ts"],
    }, null, 2)}\n`, "utf8");
    const phaseNames: string[] = [];
    const provider = {
      kind: "codex",
      generateCode: vi.fn(async (_prompt: string, context: { metadata: { phase: string } }) => {
        phaseNames.push(context.metadata.phase);
        return {
          code: `export const phases = ${JSON.stringify(phaseNames)} as const;`,
          explanation: `Completed ${context.metadata.phase}`,
          files: [],
        };
      }),
    } as unknown as IProvider;
    const plan: GamePlan = {
      title: "Phased Arena",
      description: "A compact 3D arena",
      type: "3d",
      genre: "arena",
      mechanics: ["movement", "combat", "score"],
      assets: [],
      quality: "LOW",
    };
    const startedMs = Date.now();

    const result = await new GameplayDeveloper(provider).writeCode(plan, projectPath);

    const durationMs = Date.now() - startedMs;
    console.log("Phased acceptance timings", { durationMs, phaseTimings: result.phaseTimings });
    expect(durationMs).toBeLessThan(300_000);
    expect(phaseNames).toEqual([
      "scene-setup",
      "camera-controls",
      "player-entity",
      "game-mechanics",
      "optimization",
    ]);
    expect(result.phaseTimings).toHaveLength(5);
    expect(result.phaseTimings.every((timing) => timing.status === "completed")).toBe(true);
    expect(await readFile(join(projectPath, "src", "game3d.ts"), "utf8")).toContain("optimization");
    const manifest = JSON.parse(
      await readFile(join(projectPath, ".factory", "gameplay-phases.json"), "utf8"),
    ) as { status: string; completedPhases: string[] };
    expect(manifest).toMatchObject({ status: "completed", completedPhases: phaseNames });
  }, 300_000);
});
