import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BugFixer } from "../../src/agents/bug-fixer.js";
import type { IProvider } from "../../src/providers/base.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("BugFixer", () => {
  it("passes source and evidence to the provider and applies its patch", async () => {
    const projectPath = await mkdtemp(join(process.cwd(), "projects", "bug-fixer-test-"));
    createdDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"));
    await writeFile(join(projectPath, "src", "game.ts"), "export const camera = 'wrong';", "utf8");
    const provider = {
      kind: "claude",
      fixBug: vi.fn(async () => ({
        summary: "camera fixed",
        patches: [{ path: "src/game.ts", content: "export const camera = 'centered';" }],
      })),
    } as unknown as IProvider;

    const response = await new BugFixer(provider).fix(projectPath, ["black screen"], ["camera missing"]);

    expect(response.summary).toBe("camera fixed");
    expect(await readFile(join(projectPath, "src", "game.ts"), "utf8")).toContain("centered");
    expect(provider.fixBug).toHaveBeenCalledWith(
      expect.stringContaining("wrong"),
      expect.stringContaining("camera missing"),
      expect.objectContaining({ role: "BugFixer" }),
    );
  });
});
