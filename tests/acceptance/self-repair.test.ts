import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { PNG } from "pngjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelfRepairLoop } from "../../src/browser/repair-loop.js";
import type { BrowserTestResult } from "../../src/browser/tester.js";
import type { IProvider } from "../../src/providers/base.js";

const createdDirectories: string[] = [];

function screenshot(visible: boolean): string {
  const png = new PNG({ width: 16, height: 16 });
  for (let index = 0; index < 256; index += 1) {
    const offset = index * 4;
    const accent = visible && index > 100;
    png.data[offset] = accent ? 230 : 0;
    png.data[offset + 1] = accent ? 180 : 0;
    png.data[offset + 2] = accent ? 50 : 0;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png).toString("base64");
}

function result(image: string): BrowserTestResult {
  return {
    screenshot: image,
    screenshotPath: "evidence.png",
    consoleErrors: [],
    consoleMessages: [],
    requestFailures: [],
    metrics: { fps: 60, ready: true },
    url: "http://localhost",
    durationMs: 1,
  };
}

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("self-repair acceptance", () => {
  it("detects a black camera, patches it and passes a second visual review", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "self-repair-acceptance-"));
    createdDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"));
    await writeFile(join(projectPath, "src", "game.ts"), "export const cameraTarget = 'outside-scene';", "utf8");
    const captures = [result(screenshot(false)), result(screenshot(true))];
    const run = vi.fn(async () => captures.shift() ?? result(screenshot(true)));
    const provider = {
      kind: "codex",
      isAvailable: vi.fn(async () => false),
      fixBug: vi.fn(async () => ({
        summary: "Moved camera into the gameplay scene",
        patches: [{ path: "src/game.ts", content: "export const cameraTarget = 'gameplay-center';" }],
      })),
    } as unknown as IProvider;
    const loop = new SelfRepairLoop(provider, {
      maxIterations: 5,
      buildRunner: async () => ({ exitCode: 0, stdout: "built", stderr: "" }),
      browserTester: { run },
    });

    const repaired = await loop.run(projectPath);

    expect(repaired.iterations).toHaveLength(2);
    expect(repaired.iterations[0]?.review?.passed).toBe(false);
    expect(repaired.iterations[1]?.review?.passed).toBe(true);
    expect(provider.fixBug).toHaveBeenCalledOnce();
    expect(await readFile(join(projectPath, "src", "game.ts"), "utf8")).toContain("gameplay-center");
  });
});
