import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GameplayDeveloper } from "../../src/agents/gameplay-developer.js";
import type { GamePlan } from "../../src/agents/game-planner.js";
import { PhaseOrchestrator } from "../../src/agents/phase-orchestrator.js";
import type { IProvider } from "../../src/providers/base.js";
import type { ProcessRunner } from "../../src/providers/process-runner.js";

const createdDirectories: string[] = [];
const plan: GamePlan = {
  title: "Arena",
  description: "A small arena game",
  type: "3d",
  genre: "third-person-arena",
  mechanics: ["movement", "combat"],
  assets: [],
  quality: "LOW",
};
const passingRunner: ProcessRunner = vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" }));

function createDeveloper(provider: IProvider): GameplayDeveloper {
  return new GameplayDeveloper(provider, new PhaseOrchestrator({ runner: passingRunner }));
}

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GameplayDeveloper", () => {
  it("executes phases in order and records generation metadata", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "gameplay-test-"));
    createdDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"));
    await writeFile(join(projectPath, "src", "game3d.ts"), "export const oldCode = true;", "utf8");
    const provider = {
      kind: "codex",
      generateCode: vi.fn(async () => ({
        code: "",
        explanation: "Added arena controls",
        files: [{ path: "src/game3d.ts", content: "export const arena = true;" }],
      })),
    } as unknown as IProvider;

    const result = await createDeveloper(provider).writeCode(plan, projectPath);

    expect(result.files).toEqual(["src/game3d.ts"]);
    expect(await readFile(join(projectPath, "src", "game3d.ts"), "utf8")).toContain("arena = true");
    expect(await readFile(join(projectPath, ".factory", "gameplay-generation.json"), "utf8")).toContain("codex");
    const phaseManifest = JSON.parse(
      await readFile(join(projectPath, ".factory", "gameplay-phases.json"), "utf8"),
    ) as { status: string; completedPhases: string[] };
    expect(phaseManifest).toMatchObject({
      status: "completed",
      completedPhases: ["scene-setup", "camera-controls", "player-entity", "game-mechanics", "optimization"],
    });
    expect(provider.generateCode).toHaveBeenCalledTimes(5);
    expect((provider.generateCode as ReturnType<typeof vi.fn>).mock.calls.map((call) => {
      const context = call[1] as { metadata: { phase: string } };
      return context.metadata.phase;
    })).toEqual(phaseManifest.completedPhases);
  });

  it("uses code when the provider also returns empty placeholder files", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "gameplay-code-fallback-test-"));
    createdDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"));
    await writeFile(join(projectPath, "src", "game3d.ts"), "export const oldCode = true;", "utf8");
    const provider = {
      kind: "codex-only",
      generateCode: vi.fn(async () => ({
        code: "export const generatedFromCode = true;",
        explanation: "Returned source in the code field",
        files: [{ path: "src/game3d.ts", content: "" }],
      })),
    } as unknown as IProvider;

    const result = await createDeveloper(provider).writeCode(plan, projectPath);

    expect(result.files).toEqual(["src/game3d.ts"]);
    expect(await readFile(join(projectPath, "src", "game3d.ts"), "utf8"))
      .toContain("generatedFromCode = true");
  });

  it("rejects a gameplay response that escapes src", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "gameplay-path-test-"));
    createdDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"));
    await writeFile(join(projectPath, "src", "game3d.ts"), "export {};", "utf8");
    const provider = {
      kind: "codex",
      generateCode: vi.fn(async () => ({ code: "", explanation: "", files: [{ path: "../secret.ts", content: "bad" }] })),
    } as unknown as IProvider;

    await expect(createDeveloper(provider).writeCode(plan, projectPath)).rejects.toThrow("may replace only src/game3d.ts");
  });
});
