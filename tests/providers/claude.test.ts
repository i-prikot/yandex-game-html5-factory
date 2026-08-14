import { describe, expect, it, vi } from "vitest";

import { ClaudeCodeProvider } from "../../src/providers/claude.js";
import type { ProcessRunner } from "../../src/providers/process-runner.js";

describe("ClaudeCodeProvider", () => {
  it("parses a Claude Code JSON envelope", async () => {
    const runner: ProcessRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") {
        return { exitCode: 0, stdout: "2.0.0", stderr: "" };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          result: JSON.stringify({ code: "export {};", explanation: "ok", files: [] }),
        }),
        stderr: "",
      };
    });
    const provider = new ClaudeCodeProvider({ runner });

    const result = await provider.generateCode("Create a scene", {
      projectPath: process.cwd(),
      role: "GameplayDeveloper",
    });

    expect(result.code).toBe("export {};");
    expect(result.files).toEqual([]);
  });

  it("retries transient CLI failures", async () => {
    let requestCount = 0;
    const runner: ProcessRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") {
        return { exitCode: 0, stdout: "2.0.0", stderr: "" };
      }
      requestCount += 1;
      if (requestCount < 3) {
        return { exitCode: 1, stdout: "", stderr: "rate limited" };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ result: JSON.stringify({ code: "ok", explanation: "ok", files: [] }) }),
        stderr: "",
      };
    });
    const provider = new ClaudeCodeProvider({ runner, sleep: async () => undefined });

    await expect(
      provider.generateCode("Create", { projectPath: process.cwd(), role: "Developer" }),
    ).resolves.toMatchObject({ code: "ok" });
    expect(requestCount).toBe(3);
  });
});
