import { mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { createLogger } from "../core/logger.js";
import type {
  AnalysisResponse,
  CodeResponse,
  FixResponse,
  IProvider,
  ProviderContext,
} from "./base.js";
import { ProviderResponseError, ProviderUnavailableError } from "./base.js";
import { extractAgentMessage } from "./codex.js";
import { runProcess, type ProcessRunner } from "./process-runner.js";

const codeResponseSchema = z.object({
  code: z.string(),
  explanation: z.string(),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
});
const analysisResponseSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
const fixResponseSchema = z.object({
  summary: z.string(),
  patches: z.array(z.object({ path: z.string(), content: z.string() })),
});

const CODEX_CONFIG = `model_provider = "crs"
model = "gpt-5.4"
model_reasoning_effort = "high"
disable_response_storage = true
preferred_auth_method = "apikey"

[model_providers.crs]
name = "crs"
base_url = "https://bridge.gptclaudegemini.xyz/"
wire_api = "responses"
requires_openai_auth = false
env_key = "CRS_OAI_KEY"
include_environment_context = false
include_permissions_instructions = false
include_apps_instructions = false
include_collaboration_mode_instructions = false

[analytics]
enabled = false
`;

const ROLE_MODEL_ENV_NAMES: Readonly<Record<string, string>> = {
  GamePlanner: "CODEX_ONLY_MODEL_GAME_PLANNER",
  GameplayDeveloper: "CODEX_ONLY_MODEL_GAMEPLAY_DEVELOPER",
  BugFixer: "CODEX_ONLY_MODEL_BUG_FIXER",
  VisualReviewer: "CODEX_ONLY_MODEL_VISUAL_REVIEWER",
};

export interface CodexOnlyProviderOptions {
  command?: string;
  timeoutMs?: number;
  runner?: ProcessRunner;
  codexHomePath?: string;
}

export class CodexOnlyProvider implements IProvider {
  public readonly kind = "codex-only" as const;
  private readonly logger = createLogger("provider-codex-only");
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly runner: ProcessRunner;
  private readonly codexHomePath: string;

  public constructor(options: CodexOnlyProviderOptions = {}) {
    this.command = options.command ?? process.env.CODEX_CLI_PATH ?? "codex";
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.runner = options.runner ?? runProcess;
    this.codexHomePath = options.codexHomePath ?? path.join(os.tmpdir(), "codex-only-crs");
  }

  public async isAvailable(): Promise<boolean> {
    const hasApiKey = Boolean(process.env.CRS_OAI_KEY?.trim());
    this.logger.debug("Checking Codex-only availability", { command: this.command, hasApiKey });
    if (!hasApiKey) {
      this.logger.debug("Codex-only availability check failed", { reason: "CRS_OAI_KEY is not set" });
      return false;
    }

    try {
      const result = await this.runner(this.command, ["--version"], {
        cwd: process.cwd(),
        timeoutMs: 10_000,
      });
      const isAvailable = result.exitCode === 0;
      this.logger.debug("Codex-only CLI availability checked", { isAvailable });
      return isAvailable;
    } catch (error) {
      this.logger.debug("Codex-only availability check failed", {
        reason: this.sanitizeMessage(error instanceof Error ? error.message : String(error)),
      });
      return false;
    }
  }

  public async generateCode(prompt: string, context: ProviderContext): Promise<CodeResponse> {
    return this.request(
      `${this.systemContext(context)}\n${prompt}\nReturn only JSON: {"code":"", "explanation":"", "files":[{"path":"", "content":""}]}.`,
      context,
      codeResponseSchema,
    );
  }

  public async analyzeScreenshot(imageBase64: string, context: ProviderContext): Promise<AnalysisResponse> {
    const evidenceDirectory = path.join(context.projectPath, ".factory", "evidence");
    const imagePath = path.join(evidenceDirectory, "vision-input.png");
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(imagePath, Buffer.from(imageBase64, "base64"));
    this.logger.debug("Codex-only vision input prepared", { role: context.role, imagePath });

    try {
      return await this.request(
        `${this.systemContext(context)}\nInspect the attached game screenshot for blank rendering, missing objects, clipping, broken layout, and unreadable UI. Return only JSON: {"passed":true,"issues":[],"suggestions":[],"confidence":0.0}.`,
        context,
        analysisResponseSchema,
        imagePath,
      );
    } finally {
      await unlink(imagePath).catch(() => undefined);
      this.logger.debug("Codex-only vision input removed", { role: context.role, imagePath });
    }
  }

  public async fixBug(code: string, error: string, context: ProviderContext): Promise<FixResponse> {
    return this.request(
      `${this.systemContext(context)}\nFix the reported game failure.\nError:\n${error}\nCurrent code:\n${code}\nReturn complete replacement files only as JSON: {"summary":"", "patches":[{"path":"", "content":""}]}.`,
      context,
      fixResponseSchema,
    );
  }

  private resolveModel(role: string): string {
    const roleEnvName = ROLE_MODEL_ENV_NAMES[role];
    const roleModel = roleEnvName ? process.env[roleEnvName]?.trim() : undefined;
    const defaultModel = process.env.CODEX_ONLY_MODEL_DEFAULT?.trim() || "gpt-5.4";
    const model = roleModel || defaultModel;
    this.logger.debug("Resolved Codex-only model", { role, model });
    return model;
  }

  private async prepareCodexHome(): Promise<void> {
    await mkdir(this.codexHomePath, { recursive: true, mode: 0o700 });
    await Promise.all([
      writeFile(path.join(this.codexHomePath, "config.toml"), CODEX_CONFIG, { encoding: "utf8", mode: 0o600 }),
      writeFile(
        path.join(this.codexHomePath, "auth.json"),
        `${JSON.stringify({ OPENAI_API_KEY: null }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
      ),
    ]);
    this.logger.debug("Prepared isolated Codex-only home", { codexHomePath: this.codexHomePath });
  }

  private systemContext(context: ProviderContext): string {
    return `You are the ${context.role} role in a Yandex HTML5 game factory. Work only inside ${context.projectPath}. Do not include secrets, markdown fences, or commentary outside JSON.`;
  }

  private async request<T>(
    prompt: string,
    context: ProviderContext,
    schema: z.ZodType<T>,
    imagePath?: string,
  ): Promise<T> {
    await this.prepareCodexHome();
    if (!(await this.isAvailable())) {
      throw new ProviderUnavailableError(
        this.kind,
        "CRS_OAI_KEY is not set or codex CLI is unavailable",
      );
    }

    const model = this.resolveModel(context.role);
    const args = [
      "exec",
      "--json",
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--model",
      model,
    ];
    if (imagePath) {
      args.push("--image", imagePath);
    }
    args.push(prompt);

    const runnerEnv: NodeJS.ProcessEnv = {
      ...process.env,
      CODEX_HOME: this.codexHomePath,
      CRS_OAI_KEY: process.env.CRS_OAI_KEY ?? "",
    };
    this.logger.info("Requesting Codex-only", {
      role: context.role,
      model,
      hasImage: Boolean(imagePath),
    });
    const result = await this.runner(this.command, args, {
      cwd: context.projectPath,
      timeoutMs: this.timeoutMs,
      env: runnerEnv,
    });
    if (result.exitCode !== 0) {
      const stderr = this.sanitizeMessage(result.stderr.slice(-1_000));
      const error = new Error(`Codex-only exited with ${result.exitCode}: ${stderr}`);
      this.logger.error("Codex-only request failed", error, { role: context.role, model });
      throw error;
    }

    try {
      const parsed = JSON.parse(extractAgentMessage(result.stdout)) as unknown;
      const response = schema.parse(parsed);
      this.logger.debug("Codex-only response validated", {
        role: context.role,
        stdoutBytes: result.stdout.length,
      });
      return response;
    } catch (error) {
      throw new ProviderResponseError(this.kind, error instanceof Error ? error.message : String(error));
    }
  }

  private sanitizeMessage(message: string): string {
    const apiKey = process.env.CRS_OAI_KEY;
    return apiKey ? message.split(apiKey).join("[REDACTED]") : message;
  }
}
