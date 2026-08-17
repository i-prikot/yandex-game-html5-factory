import { describe, expect, it, vi } from "vitest";

import { CodexProvider } from "../../src/providers/codex.js";
import type { ProcessRunner } from "../../src/providers/process-runner.js";

describe("CodexProvider", () => {
  it("parses the final JSONL agent message", async () => {
    const runner: ProcessRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") {
        return { exitCode: 0, stdout: "codex 1.0", stderr: "" };
      }
      return {
        exitCode: 0,
        stdout: [
          JSON.stringify({ type: "thread.started" }),
          JSON.stringify({
            type: "item.completed",
            item: {
              type: "agent_message",
              text: JSON.stringify({ code: "export {};", explanation: "done", files: [] }),
            },
          }),
        ].join("\n"),
        stderr: "",
      };
    });
    const provider = new CodexProvider({ runner });

    const response = await provider.generateCode("Build game", {
      projectPath: process.cwd(),
      role: "GameplayDeveloper",
    });

    expect(response).toMatchObject({ code: "export {};", explanation: "done" });
  });

  it("reports unavailable CLI without returning mock content", async () => {
    const runner: ProcessRunner = vi.fn(async () => ({ exitCode: 127, stdout: "", stderr: "not found" }));
    const provider = new CodexProvider({ runner });

    await expect(
      provider.generateCode("Build", { projectPath: process.cwd(), role: "Developer" }),
    ).rejects.toThrow("codex provider is unavailable");
  });

  it("uses a per-request timeout override without changing the provider default", async () => {
    const requestTimeouts: number[] = [];
    const runner: ProcessRunner = vi.fn(async (_command, args, options) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "codex 1", stderr: "" };
      requestTimeouts.push(options.timeoutMs);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          type: "item.completed",
          item: {
            type: "agent_message",
            text: JSON.stringify({ code: "export {};", explanation: "done", files: [] }),
          },
        }),
        stderr: "",
      };
    });
    const provider = new CodexProvider({ runner });

    await provider.generateCode("default", { projectPath: process.cwd(), role: "Developer" });
    await provider.generateCode(
      "phase",
      { projectPath: process.cwd(), role: "GameplayDeveloper" },
      { timeoutMs: 90_000 },
    );

    expect(requestTimeouts).toEqual([180_000, 90_000]);
  });
});
