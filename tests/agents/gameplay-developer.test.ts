import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GameplayDeveloper } from "../../src/agents/gameplay-developer.js";
import type { GamePlan } from "../../src/agents/game-planner.js";
import type { IProvider } from "../../src/providers/base.js";

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

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GameplayDeveloper", () => {
  it("writes validated provider files and records generation metadata", async () => {
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

    const result = await new GameplayDeveloper(provider).writeCode(plan, projectPath);

    expect(result.files).toEqual(["src/game3d.ts"]);
    expect(await readFile(join(projectPath, "src", "game3d.ts"), "utf8")).toContain("arena = true");
    expect(await readFile(join(projectPath, ".factory", "gameplay-generation.json"), "utf8")).toContain("codex");
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

    await expect(new GameplayDeveloper(provider).writeCode(plan, projectPath)).rejects.toThrow("inside src");
  });
});
