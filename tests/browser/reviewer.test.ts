import { PNG } from "pngjs";
import { describe, expect, it, vi } from "vitest";

import { VisualReviewer } from "../../src/browser/reviewer.js";
import type { BrowserTestResult } from "../../src/browser/tester.js";
import type { IProvider } from "../../src/providers/base.js";

function screenshot(color: [number, number, number], accent?: [number, number, number]): string {
  const png = new PNG({ width: 8, height: 8 });
  for (let index = 0; index < 64; index += 1) {
    const selected = accent && index >= 32 ? accent : color;
    const offset = index * 4;
    png.data[offset] = selected[0];
    png.data[offset + 1] = selected[1];
    png.data[offset + 2] = selected[2];
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png).toString("base64");
}

function result(image: string, consoleErrors: string[] = []): BrowserTestResult {
  return {
    screenshot: image,
    screenshotPath: "/tmp/evidence.png",
    consoleErrors,
    consoleMessages: [],
    requestFailures: [],
    metrics: { fps: 60 },
    url: "http://localhost",
    durationMs: 1,
  };
}

describe("VisualReviewer", () => {
  it("rejects a black screenshot without a vision provider", async () => {
    const review = await new VisualReviewer().analyze(result(screenshot([0, 0, 0])), process.cwd());

    expect(review.passed).toBe(false);
    expect(review.issues).toContain("Screenshot is black or nearly black");
    expect(review.source).toBe("local");
  });

  it("accepts locally distinguishable pixels and merges a provider review", async () => {
    const provider = {
      kind: "claude",
      isAvailable: vi.fn(async () => true),
      analyzeScreenshot: vi.fn(async () => ({ passed: true, issues: [], suggestions: [], confidence: 0.9 })),
    } as unknown as IProvider;
    const review = await new VisualReviewer(provider).analyze(
      result(screenshot([20, 40, 60], [220, 190, 40])),
      process.cwd(),
    );

    expect(review.passed).toBe(true);
    expect(review.source).toBe("local+vision");
    expect(provider.analyzeScreenshot).toHaveBeenCalledOnce();
  });

  it("fails visible output when browser errors exist", async () => {
    const review = await new VisualReviewer().analyze(
      result(screenshot([20, 40, 60], [220, 190, 40]), ["ReferenceError: player is not defined"]),
      process.cwd(),
    );

    expect(review.passed).toBe(false);
    expect(review.issues[0]).toContain("Browser console error");
  });
});
