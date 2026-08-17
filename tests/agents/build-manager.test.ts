import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BuildManager } from "../../src/agents/build-manager.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("BuildManager", () => {
  it("validates and packages a Yandex Games dist directory", async () => {
    const root = await mkdtemp(join(process.cwd(), "output", "build-manager-test-"));
    createdDirectories.push(root);
    const projectPath = join(root, "sample-game");
    await mkdir(join(projectPath, "dist", "assets"), { recursive: true });
    await writeFile(
      join(projectPath, "dist", "index.html"),
      '<script src="https://yandex.ru/games/sdk/v2"></script><script src="assets/game.js"></script>',
      "utf8",
    );
    await writeFile(join(projectPath, "dist", "assets", "game.js"), "console.log('ready')", "utf8");
    const manager = new BuildManager({
      outputRoot: root,
      runner: async () => ({ exitCode: 0, stdout: "built", stderr: "" }),
    });

    const result = await manager.buildForYandex(projectPath);

    expect(result.packagePath).toBe(join(root, "packages", "sample-game.zip"));
    expect((await stat(result.packagePath)).size).toBeGreaterThan(20);
    expect((await readFile(result.packagePath)).subarray(0, 2).toString()).toBe("PK");
  });

  it("refuses a build without the Yandex SDK", async () => {
    const root = await mkdtemp(join(process.cwd(), "output", "build-manager-yandex-test-"));
    createdDirectories.push(root);
    const projectPath = join(root, "sample-game");
    await mkdir(join(projectPath, "dist"), { recursive: true });
    await writeFile(join(projectPath, "dist", "index.html"), "<html></html>", "utf8");
    const manager = new BuildManager({ outputRoot: root, runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }) });

    await expect(manager.buildForYandex(projectPath)).rejects.toThrow("Yandex Games SDK");
  });

  it("refuses a dist file containing CRS_OAI_KEY", async () => {
    const root = await mkdtemp(join(process.cwd(), "output", "build-manager-crs-secret-test-"));
    createdDirectories.push(root);
    const projectPath = join(root, "sample-game");
    const secret = "crs-secret-value-for-test";
    vi.stubEnv("CRS_OAI_KEY", secret);
    await mkdir(join(projectPath, "dist", "assets"), { recursive: true });
    await writeFile(
      join(projectPath, "dist", "index.html"),
      '<script src="https://yandex.ru/games/sdk/v2"></script>',
      "utf8",
    );
    await writeFile(join(projectPath, "dist", "assets", "game.js"), `const leaked = "${secret}";`, "utf8");
    const manager = new BuildManager({
      outputRoot: root,
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    await expect(manager.buildForYandex(projectPath)).rejects.toThrow("CRS_OAI_KEY");
  });
});
