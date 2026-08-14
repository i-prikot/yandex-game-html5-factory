import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SelfRepairLoop } from "../../src/browser/repair-loop.js";
import type { VisualReview } from "../../src/browser/reviewer.js";
import type { BrowserTestResult } from "../../src/browser/tester.js";
import type { IProvider } from "../../src/providers/base.js";

const createdDirectories: string[] = [];
const browserResult: BrowserTestResult = {
  screenshot: "unused",
  screenshotPath: "evidence.png",
  consoleErrors: [],
  consoleMessages: [],
  requestFailures: [],
  metrics: { fps: 60 },
  url: "http://localhost",
  durationMs: 1,
};

function review(passed: boolean): VisualReview {
  return {
    passed,
    issues: passed ? [] : ["Screenshot is black or nearly black"],
    suggestions: passed ? [] : ["Move the camera"],
    confidence: 0.99,
    source: "local",
    evidence: { width: 10, height: 10, visiblePixelRatio: 1, meanLuminance: 0, luminanceDeviation: 0 },
  };
}

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SelfRepairLoop", () => {
  it("applies a replacement patch and validates the repaired build", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "repair-loop-test-"));
    createdDirectories.push(projectPath);
    await writeFile(join(projectPath, "game.ts"), "broken", "utf8");
    const analyze = vi.fn()
      .mockResolvedValueOnce(review(false))
      .mockResolvedValueOnce(review(true));
    const provider = {
      kind: "codex",
      fixBug: vi.fn(async () => ({
        summary: "camera repaired",
        patches: [{ path: "game.ts", content: "fixed" }],
      })),
    } as unknown as IProvider;
    const loop = new SelfRepairLoop(provider, {
      buildRunner: async () => ({ exitCode: 0, stdout: "built", stderr: "" }),
      browserTester: { run: async () => browserResult },
      reviewer: { analyze },
    });

    const result = await loop.run(projectPath);

    expect(result.passed).toBe(true);
    expect(result.iterations).toHaveLength(2);
    expect(provider.fixBug).toHaveBeenCalledOnce();
    expect(await readFile(join(projectPath, "game.ts"), "utf8")).toBe("fixed");
  });

  it("rejects provider patches outside the generated project", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "repair-loop-path-test-"));
    createdDirectories.push(projectPath);
    const provider = {
      kind: "codex",
      fixBug: vi.fn(async () => ({ summary: "unsafe", patches: [{ path: "../outside.ts", content: "bad" }] })),
    } as unknown as IProvider;
    const loop = new SelfRepairLoop(provider, {
      buildRunner: async () => ({ exitCode: 1, stdout: "", stderr: "build failed" }),
      browserTester: { run: async () => browserResult },
      reviewer: { analyze: async () => review(false) },
    });

    await expect(loop.run(projectPath)).rejects.toThrow("escaped the game project");
  });
});
