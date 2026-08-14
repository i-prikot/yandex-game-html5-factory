import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ScaffoldGenerator } from "../../src/scaffold/generator.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ScaffoldGenerator", () => {
  it("composes a Babylon base with the 3D overlay", async () => {
    const projectsRoot = await mkdtemp(join(process.cwd(), "projects", "scaffold-3d-test-"));
    createdDirectories.push(projectsRoot);
    const generator = new ScaffoldGenerator();

    const projectPath = await generator.scaffold({
      title: "Low End Runner",
      type: "3d",
      quality: "LOW",
      projectsRoot,
      installDependencies: false,
    });

    expect(await readFile(join(projectPath, "src", "game.ts"), "utf8")).toContain("./game3d");
    expect(await readFile(join(projectPath, "src", "game3d.ts"), "utf8")).toContain('quality: string = "LOW"');
    expect(await readFile(join(projectPath, "package.json"), "utf8")).not.toContain("{{GAME_SLUG}}");
  });

  it("creates a native 2D project with a self-contained Yandex adapter", async () => {
    const projectsRoot = await mkdtemp(join(process.cwd(), "projects", "scaffold-2d-test-"));
    createdDirectories.push(projectsRoot);
    const generator = new ScaffoldGenerator();

    const projectPath = await generator.scaffold({
      title: "Puzzle Grid",
      type: "2d",
      quality: "MEDIUM",
      projectsRoot,
      installDependencies: false,
    });

    const packageJson = await readFile(join(projectPath, "package.json"), "utf8");
    const adapter = await readFile(join(projectPath, "src", "yandex", "adapter.ts"), "utf8");
    expect(packageJson).not.toContain("@babylonjs/core");
    expect(adapter).toContain("export class YandexGamesAdapter");
    expect(adapter).not.toContain("babylon-base");
  });

  it("refuses to overwrite an existing project", async () => {
    const projectsRoot = await mkdtemp(join(process.cwd(), "projects", "scaffold-collision-test-"));
    createdDirectories.push(projectsRoot);
    const generator = new ScaffoldGenerator();
    const options = {
      title: "Same Game",
      type: "2d" as const,
      quality: "LOW" as const,
      projectsRoot,
      installDependencies: false,
    };
    await generator.scaffold(options);

    await expect(generator.scaffold(options)).rejects.toThrow("Project already exists");
  });
});
