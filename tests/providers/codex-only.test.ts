import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodexOnlyProvider } from "../../src/providers/codex-only.js";
import type { ProcessRunner } from "../../src/providers/process-runner.js";

const API_KEY = "crs-test-key-never-log";
const codeResponse = {
  code: "export const generated = true;",
  explanation: "generated",
  files: [{ path: "src/game.ts", content: "export const generated = true;" }],
};
const createdDirectories: string[] = [];

function jsonlResponse(response: unknown): string {
  return [
    JSON.stringify({ type: "thread.started" }),
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: JSON.stringify(response) },
    }),
  ].join("\n");
}

async function createCodexHome(): Promise<string> {
  const directory = await mkdtemp(join(process.cwd(), ".codex-only-test-"));
  createdDirectories.push(directory);
  return directory;
}

beforeEach(() => {
  vi.stubEnv("CRS_OAI_KEY", API_KEY);
  vi.stubEnv("CODEX_ONLY_MODEL_DEFAULT", "gpt-default-test");
  vi.stubEnv("CODEX_ONLY_MODEL_GAME_PLANNER", "");
  vi.stubEnv("CODEX_ONLY_MODEL_GAMEPLAY_DEVELOPER", "");
  vi.stubEnv("CODEX_ONLY_MODEL_BUG_FIXER", "");
  vi.stubEnv("CODEX_ONLY_MODEL_VISUAL_REVIEWER", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("CodexOnlyProvider", () => {
  it("passes the resolved model immediately after --model", async () => {
    let execArgs: readonly string[] = [];
    const runner: ProcessRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "codex 1", stderr: "" };
      execArgs = args;
      return { exitCode: 0, stdout: jsonlResponse(codeResponse), stderr: "" };
    });
    const provider = new CodexOnlyProvider({ runner, codexHomePath: await createCodexHome() });

    await provider.generateCode("Create gameplay", {
      projectPath: process.cwd(),
      role: "GameplayDeveloper",
    });

    const modelFlagIndex = execArgs.indexOf("--model");
    expect(modelFlagIndex).toBeGreaterThan(-1);
    expect(execArgs[modelFlagIndex + 1]).toBe("gpt-default-test");
  });

  it.each([
    ["GamePlanner", "CODEX_ONLY_MODEL_GAME_PLANNER", "planner-model"],
    ["GameplayDeveloper", "CODEX_ONLY_MODEL_GAMEPLAY_DEVELOPER", "developer-model"],
    ["BugFixer", "CODEX_ONLY_MODEL_BUG_FIXER", "fixer-model"],
    ["VisualReviewer", "CODEX_ONLY_MODEL_VISUAL_REVIEWER", "reviewer-model"],
  ])("uses the role-specific model for %s", async (role, envName, expectedModel) => {
    vi.stubEnv(envName, expectedModel);
    let execArgs: readonly string[] = [];
    const runner: ProcessRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "codex 1", stderr: "" };
      execArgs = args;
      return { exitCode: 0, stdout: jsonlResponse(codeResponse), stderr: "" };
    });
    const provider = new CodexOnlyProvider({ runner, codexHomePath: await createCodexHome() });

    await provider.generateCode("Create gameplay", { projectPath: process.cwd(), role });

    expect(execArgs[execArgs.indexOf("--model") + 1]).toBe(expectedModel);
  });

  it("falls back to the configured default and then gpt-5.4", async () => {
    const usedModels: string[] = [];
    const runner: ProcessRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "codex 1", stderr: "" };
      usedModels.push(args[args.indexOf("--model") + 1] ?? "");
      return { exitCode: 0, stdout: jsonlResponse(codeResponse), stderr: "" };
    });
    const provider = new CodexOnlyProvider({ runner, codexHomePath: await createCodexHome() });

    await provider.generateCode("Create gameplay", { projectPath: process.cwd(), role: "UnknownRole" });
    vi.stubEnv("CODEX_ONLY_MODEL_DEFAULT", "");
    await provider.generateCode("Create gameplay", { projectPath: process.cwd(), role: "GamePlanner" });

    expect(usedModels).toEqual(["gpt-default-test", "gpt-5.4"]);
  });

  it("is unavailable without CRS_OAI_KEY", async () => {
    vi.stubEnv("CRS_OAI_KEY", "");
    const runner: ProcessRunner = vi.fn(async () => ({ exitCode: 0, stdout: "codex 1", stderr: "" }));
    const provider = new CodexOnlyProvider({ runner, codexHomePath: await createCodexHome() });

    await expect(provider.isAvailable()).resolves.toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });

  it("is available with the CLI and a non-empty CRS_OAI_KEY", async () => {
    const runner: ProcessRunner = vi.fn(async () => ({ exitCode: 0, stdout: "codex 1", stderr: "" }));
    const provider = new CodexOnlyProvider({ runner, codexHomePath: await createCodexHome() });

    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it("keeps the API key out of command arguments and logs", async () => {
    let execArgs: readonly string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runner: ProcessRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "codex 1", stderr: "" };
      execArgs = args;
      return { exitCode: 0, stdout: jsonlResponse(codeResponse), stderr: "" };
    });
    const provider = new CodexOnlyProvider({ runner, codexHomePath: await createCodexHome() });

    await provider.generateCode("Create gameplay", { projectPath: process.cwd(), role: "GamePlanner" });

    expect(execArgs).not.toContain(API_KEY);
    expect(execArgs.join(" ")).not.toContain(API_KEY);
    expect(logSpy.mock.calls.flat().join(" ")).not.toContain(API_KEY);
  });

  it("passes the isolated CODEX_HOME in the child environment", async () => {
    const codexHomePath = await createCodexHome();
    let requestEnv: NodeJS.ProcessEnv | undefined;
    const runner: ProcessRunner = vi.fn(async (_command, args, options) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "codex 1", stderr: "" };
      requestEnv = options.env;
      return { exitCode: 0, stdout: jsonlResponse(codeResponse), stderr: "" };
    });
    const provider = new CodexOnlyProvider({ runner, codexHomePath });

    await provider.generateCode("Create gameplay", { projectPath: process.cwd(), role: "GamePlanner" });

    expect(requestEnv?.CODEX_HOME).toBe(codexHomePath);
    expect(requestEnv?.CRS_OAI_KEY).toBe(API_KEY);
  });

  it("writes CRS config and minimal auth before invoking the CLI", async () => {
    const codexHomePath = await createCodexHome();
    let checkedBeforeRunner = false;
    const runner: ProcessRunner = vi.fn(async (_command, args) => {
      if (!checkedBeforeRunner) {
        const config = await readFile(join(codexHomePath, "config.toml"), "utf8");
        const auth = JSON.parse(await readFile(join(codexHomePath, "auth.json"), "utf8")) as unknown;
        expect(config).toContain('model_provider = "crs"');
        expect(config).toContain('base_url = "https://bridge.gptclaudegemini.xyz/"');
        expect(config).toContain('wire_api = "responses"');
        expect(config).toContain('env_key = "CRS_OAI_KEY"');
        expect(config).toContain("disable_response_storage = true");
        expect(config).toContain("[analytics]\nenabled = false");
        expect(auth).toEqual({ OPENAI_API_KEY: null });
        checkedBeforeRunner = true;
      }
      return args[0] === "--version"
        ? { exitCode: 0, stdout: "codex 1", stderr: "" }
        : { exitCode: 0, stdout: jsonlResponse(codeResponse), stderr: "" };
    });
    const provider = new CodexOnlyProvider({ runner, codexHomePath });

    await provider.generateCode("Create gameplay", { projectPath: process.cwd(), role: "GamePlanner" });

    expect(checkedBeforeRunner).toBe(true);
  });

  it("parses the final JSONL agent message as a CodeResponse", async () => {
    const runner: ProcessRunner = vi.fn(async (_command, args) => args[0] === "--version"
      ? { exitCode: 0, stdout: "codex 1", stderr: "" }
      : { exitCode: 0, stdout: jsonlResponse(codeResponse), stderr: "" });
    const provider = new CodexOnlyProvider({ runner, codexHomePath: await createCodexHome() });

    const response = await provider.generateCode("Create gameplay", {
      projectPath: process.cwd(),
      role: "GameplayDeveloper",
    });

    expect(response).toEqual(codeResponse);
  });

  it("passes screenshot input and removes it when the runner throws", async () => {
    const projectPath = await createCodexHome();
    const imagePath = join(projectPath, ".factory", "evidence", "vision-input.png");
    let execArgs: readonly string[] = [];
    const runner: ProcessRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "codex 1", stderr: "" };
      execArgs = args;
      throw new Error("request failed");
    });
    const provider = new CodexOnlyProvider({ runner, codexHomePath: join(projectPath, "codex-home") });

    await expect(provider.analyzeScreenshot(Buffer.from("image").toString("base64"), {
      projectPath,
      role: "VisualReviewer",
    })).rejects.toThrow("request failed");

    const imageFlagIndex = execArgs.indexOf("--image");
    expect(execArgs[imageFlagIndex + 1]).toBe(imagePath);
    await expect(access(imagePath)).rejects.toThrow();
  });

  it("redacts the API key from failed request errors and logs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runner: ProcessRunner = vi.fn(async (_command, args) => args[0] === "--version"
      ? { exitCode: 0, stdout: "codex 1", stderr: "" }
      : { exitCode: 1, stdout: "", stderr: `proxy rejected ${API_KEY}` });
    const provider = new CodexOnlyProvider({ runner, codexHomePath: await createCodexHome() });

    await expect(provider.generateCode("Create gameplay", {
      projectPath: process.cwd(),
      role: "GamePlanner",
    })).rejects.not.toThrow(API_KEY);

    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain(API_KEY);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("[REDACTED]");
  });
});
