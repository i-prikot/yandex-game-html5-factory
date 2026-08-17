import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GameplayPhaseExecutionError,
  PhaseOrchestrator,
} from "../../src/agents/phase-orchestrator.js";
import type { GamePlan } from "../../src/agents/game-planner.js";
import type { GameplayPhase } from "../../src/agents/gameplay-phases.js";
import type { IProvider } from "../../src/providers/base.js";

const createdDirectories: string[] = [];
const plan: GamePlan = {
  title: "Arena",
  description: "A small arena game",
  type: "3d",
  genre: "arena",
  mechanics: ["movement", "combat"],
  assets: [],
  quality: "LOW",
};
const phases: GameplayPhase[] = [
  { name: "scene", scope: "Create the scene", dependencies: [], estimatedTimeMs: 10_000 },
  { name: "combat", scope: "Add combat", dependencies: ["scene"], estimatedTimeMs: 10_000 },
];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

async function createProject(): Promise<string> {
  const projectPath = await mkdtemp(join(process.cwd(), "projects", "phase-orchestrator-test-"));
  createdDirectories.push(projectPath);
  await mkdir(join(projectPath, "src"));
  await writeFile(join(projectPath, "src", "game3d.ts"), "export const initial = true;", "utf8");
  return projectPath;
}

describe("PhaseOrchestrator", () => {
  it("executes phases in order and carries the last complete revision forward", async () => {
    const projectPath = await createProject();
    const observedCode: string[] = [];
    const provider = {
      kind: "codex",
      generateCode: vi.fn(async (_prompt: string, context: { files?: Readonly<Record<string, string>> }) => {
        observedCode.push(context.files?.["src/game3d.ts"] ?? "");
        const revision = `export const revision = ${observedCode.length};`;
        return { code: revision, explanation: `phase ${observedCode.length}`, files: [] };
      }),
    } as unknown as IProvider;

    const result = await new PhaseOrchestrator().executePhases(phases, plan, projectPath, provider);

    expect(observedCode).toEqual(["export const initial = true;", "export const revision = 1;"]);
    expect(result.completedPhases).toEqual(["scene", "combat"]);
    expect(result.code).toBe("export const revision = 2;");
  });

  it("fails a phase at the hard timeout", async () => {
    const projectPath = await createProject();
    const provider = {
      kind: "codex",
      generateCode: vi.fn(() => new Promise(() => undefined)),
    } as unknown as IProvider;

    await expect(
      new PhaseOrchestrator({ hardTimeoutMs: 5 }).executePhases([phases[0]!], plan, projectPath, provider),
    ).rejects.toThrow("phase timed out after 5ms");
  });

  it("exposes the last successful code when a later phase fails", async () => {
    const projectPath = await createProject();
    const provider = {
      kind: "codex",
      generateCode: vi.fn()
        .mockResolvedValueOnce({ code: "export const scene = true;", explanation: "scene", files: [] })
        .mockRejectedValueOnce(new Error("provider failed")),
    } as unknown as IProvider;

    const operation = new PhaseOrchestrator().executePhases(phases, plan, projectPath, provider);

    await expect(operation).rejects.toMatchObject({
      name: "GameplayPhaseExecutionError",
      completedPhases: ["scene"],
      partialCode: "export const scene = true;",
    } satisfies Partial<GameplayPhaseExecutionError>);
  });
});
