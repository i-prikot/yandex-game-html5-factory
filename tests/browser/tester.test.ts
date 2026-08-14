import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import type { Browser } from "puppeteer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserTester } from "../../src/browser/tester.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("BrowserTester", () => {
  it("captures runtime evidence and always cleans up", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "browser-test-"));
    createdDirectories.push(projectPath);
    const listeners = new Map<string, (value: unknown) => void>();
    const page = {
      setDefaultNavigationTimeout: vi.fn(),
      setViewport: vi.fn(),
      on: vi.fn((event: string, listener: (value: unknown) => void) => listeners.set(event, listener)),
      goto: vi.fn(async () => undefined),
      waitForFunction: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => ({ ready: true, fps: 60 })),
      screenshot: vi.fn(async () => Buffer.from("png evidence").toString("base64")),
    };
    const close = vi.fn(async () => undefined);
    const stop = vi.fn(async () => undefined);
    const tester = new BrowserTester({
      port: 5199,
      startServer: async () => ({ url: "http://127.0.0.1:5199", stop }),
      launchBrowser: async () => ({ newPage: async () => page, close }) as unknown as Browser,
    });

    const result = await tester.run(projectPath);

    expect(result.metrics).toEqual({ ready: true, fps: 60 });
    expect(result.screenshot).toBe(Buffer.from("png evidence").toString("base64"));
    expect(await readFile(result.screenshotPath, "utf8")).toBe("png evidence");
    expect(close).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });
});
