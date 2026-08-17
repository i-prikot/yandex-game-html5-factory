import { describe, expect, it, vi } from "vitest";

import type { IProvider } from "../../src/providers/base.js";
import { ClaudeCodeProvider } from "../../src/providers/claude.js";
import { CodexProvider } from "../../src/providers/codex.js";
import { createProvider } from "../../src/providers/factory.js";
import type { ProcessRunner } from "../../src/providers/process-runner.js";

const response = {
  code: "export const generated = true;",
  explanation: "generated",
  files: [{ path: "src/game.ts", content: "export const generated = true;" }],
};

describe("host agent provider acceptance", () => {
  it("uses Claude Code JSON output through the provider abstraction", async () => {
    const runner: ProcessRunner = vi.fn(async (_command, args) => args.includes("--version")
      ? { exitCode: 0, stdout: "claude 1", stderr: "" }
      : { exitCode: 0, stdout: JSON.stringify({ result: JSON.stringify(response) }), stderr: "" });
    const provider = new ClaudeCodeProvider({ runner, sleep: async () => undefined });

    const selected = await createProvider("claude", {
      claude: provider,
      codex: {} as IProvider,
      codexOnly: {} as IProvider,
    });
    const generated = await selected.generateCode("Create gameplay", { projectPath: process.cwd(), role: "GameplayDeveloper" });

    expect(selected.kind).toBe("claude");
    expect(generated.code).toContain("generated = true");
  });

  it("uses Codex JSONL output through the provider abstraction", async () => {
    const runner: ProcessRunner = vi.fn(async (_command, args) => args.includes("--version")
      ? { exitCode: 0, stdout: "codex 1", stderr: "" }
      : {
          exitCode: 0,
          stdout: `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(response) } })}\n`,
          stderr: "",
        });
    const provider = new CodexProvider({ runner });

    const selected = await createProvider("codex", {
      claude: {} as IProvider,
      codex: provider,
      codexOnly: {} as IProvider,
    });
    const generated = await selected.generateCode("Create gameplay", { projectPath: process.cwd(), role: "GameplayDeveloper" });

    expect(selected.kind).toBe("codex");
    expect(generated.files[0]?.path).toBe("src/game.ts");
  });

  it("selects Codex-only explicitly without adding it to auto detection", async () => {
    const codexOnly = {
      kind: "codex-only",
      isAvailable: vi.fn(async () => true),
      generateCode: vi.fn(),
      analyzeScreenshot: vi.fn(),
      fixBug: vi.fn(),
    } satisfies IProvider;

    const selected = await createProvider("codex-only", {
      claude: {} as IProvider,
      codex: {} as IProvider,
      codexOnly,
    });

    expect(selected.kind).toBe("codex-only");
  });
});
