import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalAssetLibrary } from "../../src/asset-pipeline/local-library.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("LocalAssetLibrary", () => {
  it("finds a tagged model and copies it into the project", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "local-library-test-"));
    createdDirectories.push(projectPath);
    const library = new LocalAssetLibrary();

    const result = await library.resolve(
      { type: "3d-model", name: "Race vehicle", description: "Low poly car", tags: ["car"] },
      projectPath,
    );

    expect(result?.source).toBe("local");
    expect(result?.outputPath).toBe("public/assets/car.glb");
    await expect(stat(join(projectPath, "public", "assets", "car.glb"))).resolves.toMatchObject({ size: expect.any(Number) });
  });

  it("copies a valid 512px PNG texture", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "local-texture-test-"));
    createdDirectories.push(projectPath);
    const library = new LocalAssetLibrary();

    const result = await library.resolve(
      { type: "texture", name: "Grass", description: "Ground", tags: ["grass"] },
      projectPath,
    );
    const png = await readFile(join(projectPath, result?.outputPath ?? ""));

    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
  });
});
