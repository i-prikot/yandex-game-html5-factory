import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BuildManager } from "../../src/agents/build-manager.js";
import { GameArchitect } from "../../src/agents/game-architect.js";
import type { GamePlan } from "../../src/agents/game-planner.js";
import { ScaffoldGenerator } from "../../src/scaffold/generator.js";

let acceptanceRoot = "";

beforeAll(async () => {
  acceptanceRoot = await mkdtemp(join(process.cwd(), "output", "acceptance-yandex-package-"));
});

afterAll(async () => {
  await rm(acceptanceRoot, { recursive: true, force: true });
});

describe("Yandex production package acceptance", () => {
  it("builds a standalone ZIP with SDK v2, optimized assets and the local adapter fallback", async () => {
    const plan: GamePlan = {
      title: "Yandex Package Acceptance",
      description: "A lightweight clicker for Yandex Games",
      type: "2d",
      genre: "clicker",
      mechanics: ["click", "score", "save"],
      assets: [],
      quality: "LOW",
    };
    const projectPath = await new GameArchitect(new ScaffoldGenerator(), {
      projectsRoot: join(acceptanceRoot, "projects"),
      installDependencies: true,
    }).scaffold(plan);
    const production = await new BuildManager({ outputRoot: join(acceptanceRoot, "output") })
      .buildForYandex(projectPath);

    const entries = unzipSync(new Uint8Array(await readFile(production.packagePath)));
    const names = Object.keys(entries);
    const index = strFromU8(entries["index.html"] ?? new Uint8Array());
    const scripts = names.filter((name) => name.endsWith(".js"));
    const styles = names.filter((name) => name.endsWith(".css"));
    const bundledScripts = scripts.map((name) => strFromU8(entries[name] ?? new Uint8Array())).join("\n");

    expect(production.packagePath).toMatch(/output[/\\]packages[/\\]yandex-package-acceptance\.zip$/u);
    expect(index).toContain('<script src="https://yandex.ru/games/sdk/v2"></script>');
    expect(scripts.length).toBeGreaterThan(0);
    expect(styles.length).toBeGreaterThan(0);
    expect(names.some((name) => /^assets\/[^/]+-[A-Za-z0-9_-]+\.(?:js|css)$/u.test(name))).toBe(true);
    expect(bundledScripts).toContain("Yandex SDK not found, using mock mode");
    expect(bundledScripts).toContain("YaGames");
  }, 300_000);
});
