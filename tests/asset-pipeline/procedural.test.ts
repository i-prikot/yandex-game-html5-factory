import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  generateBabylonPrimitive,
  ProceduralAssetResolver,
} from "../../src/asset-pipeline/procedural.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ProceduralAssetResolver", () => {
  it("generates modular Babylon code for a tagged primitive", () => {
    const code = generateBabylonPrimitive({
      type: "3d-model",
      name: "Coin",
      description: "Collectible coin",
      tags: ["sphere"],
    });

    expect(code).toContain('from "@babylonjs/core/Meshes/meshBuilder"');
    expect(code).toContain("CreateSphere");
    expect(code).toContain("export function createCoin");
  });

  it("writes a procedural texture inside the game project", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "procedural-test-"));
    createdDirectories.push(projectPath);
    const resolver = new ProceduralAssetResolver();

    const result = await resolver.resolve(
      { type: "texture", name: "Road / unsafe", description: "Road", tags: ["stripes"] },
      projectPath,
    );

    expect(result.outputPath).toBe("public/assets/road-unsafe.svg");
    const content = await readFile(join(projectPath, result.outputPath), "utf8");
    expect(content).toContain("<svg");
  });
});
